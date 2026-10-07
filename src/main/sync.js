'use strict';
// Sync engine.
// - Only one sync runs at a time (manual + automatic can't overlap).
// - 1 GetOwnedGames call per run, then only games that changed (playtime moved,
//   never synced, or stale > 24 h) get their achievements refreshed.
// - Schema cached 7 days, global % cached 3 days.
// - Emits progress / done events to the renderer.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const data = require('./data');
const steam = require('./steam');
const { mergeAchievements, summarize, completionUpdate } = require('./achLogic');

const DAY = 24 * 60 * 60 * 1000;
const SCHEMA_TTL = 7 * DAY;
const PCT_TTL = 3 * DAY;
const STALE_GAME = DAY;

let running = null;
let emit = () => {};
let notify = () => {};
let timer = null;

function configure({ emitter, notifier }) {
  if (emitter) emit = emitter;
  if (notifier) notify = notifier;
}

function isRunning() { return !!running; }

function credentials() {
  const s = data.getSettings();
  return { key: data.getApiKey(), steamId: String(s.steamId || '').trim(), language: data.steamLanguage() };
}

// ---------- icons ----------
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i; // not valid file names on Windows

/** Fix stored icon addresses (old host, empty gray icon) in place. */
function normalizeIcons(list) {
  for (const a of Object.values(list || {})) {
    if (!a || typeof a !== 'object') continue;
    a.iconUrl = steam.normalizeIconUrl(a.iconUrl);
    a.iconGrayUrl = steam.normalizeIconUrl(a.iconGrayUrl);
  }
}

async function downloadIcons(appid, list) {
  const dir = data.achievementIconDir(appid);
  const jobs = [];
  const used = new Set(); // Windows file names are case-insensitive
  for (const a of Object.values(list)) {
    let base = String(a.achievementApiName || '').replace(/[^\w.-]/g, '_');
    if (!base) continue;
    if (RESERVED.test(base)) base = `_${base}`;
    while (used.has(base.toLowerCase())) base += '_';
    used.add(base.toLowerCase());
    for (const [urlKey, pathKey, suffix] of [['iconUrl', 'localIconPath', ''], ['iconGrayUrl', 'localGrayIconPath', '_gray']]) {
      const file = path.join(dir, `${base}${suffix}.jpg`);
      const legacy = path.join(dir, `${base}${suffix}.png`); // 1.x saved jpg data with .png name
      if (exists(file)) { a[pathKey] = file; continue; }
      if (exists(legacy)) { a[pathKey] = legacy; continue; }
      if (!a[urlKey]) continue;
      jobs.push({ urls: steam.iconCandidates(a[urlKey]), file, a, pathKey });
    }
  }
  if (!jobs.length) return;
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      for (const url of j.urls) {
        if (await steam.downloadFile(url, j.file, fs)) { j.a[j.pathKey] = j.file; break; }
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}
function exists(f) { try { return fs.statSync(f).size > 0; } catch { return false; } }

// ---------- one game ----------
// Only one refresh per game at a time: the "now playing" refresh and a full sync
// could otherwise read the same old data and record the same unlock twice.
const inFlight = new Map();

/**
 * Refresh one game. Notifications (new achievements, 100%, new achievements added
 * to a finished game) are sent from here, so they also fire when the refresh comes
 * from "now playing" and not only from a full sync.
 */
function syncGame(appid, opts = {}) {
  const id = Number(appid);
  if (inFlight.has(id)) return inFlight.get(id);
  const p = doSyncGame(id, opts)
    .then((r) => { if (r && opts.notify !== false) notifyResult(r); return r; })
    .finally(() => inFlight.delete(id));
  inFlight.set(id, p);
  return p;
}

async function doSyncGame(appid, { forceSchema = false } = {}) {
  const id = Number(appid);
  const game = data.getGame(id);
  if (!game) return null;
  const cred = credentials();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const ach = data.getAchGame(id);
  const meta = { ...(ach.meta || {}) };
  const prevList = ach.list || {};
  // Also treat data migrated from 1.x (no schema timestamp yet) as a first sync,
  // so the history/notifications are not flooded with old unlocks.
  const firstSync = Object.keys(prevList).length === 0 || !meta.schemaAt;

  // 1) Player achievements (one call). Errors like 'auth'/'private' bubble up.
  const player = await steam.getPlayerAchievements({ key: cred.key, steamId: cred.steamId, appid: id, language: cred.language });
  if (player.noStats) {
    data.patchGame(id, { noStats: true, achTotal: 0, achUnlocked: 0, achSyncedAt: now, syncError: null });
    return { appid: id, newlyUnlocked: [], completed: false };
  }

  // 2) Schema only when needed.
  const unknown = player.list.some(p => !prevList[p.apiname]);
  let schema = null;
  const needSchema = forceSchema || firstSync || unknown || meta.lang !== cred.language || !meta.schemaAt || now - meta.schemaAt > SCHEMA_TTL;
  if (needSchema) {
    try {
      schema = await steam.getSchema({ key: cred.key, appid: id, language: cred.language });
      meta.schemaAt = now;
      meta.lang = cred.language;
    } catch (err) {
      if (err.kind === 'auth') throw err;
      schema = null; // keep local data
    }
  }

  // 3) Global % (rarity) when stale.
  let globalPct = null;
  if (!meta.pctAt || now - meta.pctAt > PCT_TTL || firstSync) {
    globalPct = await steam.getGlobalPercentages(id);
    if (globalPct) meta.pctAt = now;
  }

  const { list, changes } = mergeAchievements({
    appid: id, prevList, schema, player: player.list, globalPct, nowIso, firstSync
  });

  normalizeIcons(list);
  await downloadIcons(id, list);
  data.setAchGame(id, { meta, list });
  data.pushChanges(changes);

  const summary = summarize(list);
  const comp = completionUpdate(game, summary, now);
  const { justCompleted, justCompletedFirst, ...compPatch } = comp;
  data.patchGame(id, {
    ...summary,
    ...compPatch,
    noStats: false,
    achSyncedAt: now,
    playtimeAtSync: game.playtimeMinutes ?? null,
    syncError: null
  });

  return {
    appid: id,
    name: game.name,
    newlyUnlocked: changes.filter(c => c.changeType === 'unlocked'),
    added: changes.filter(c => c.changeType === 'added').length,
    completed: justCompleted && !firstSync, // no celebrations for data migrated from 1.x
    newAchAlert: !!compPatch.newAchAlert
  };
}

// ---------- full run ----------
/**
 * @param {object} opts
 * @param {boolean} opts.force     refresh every game (manual "Sync now")
 * @param {number[]} opts.only     restrict to these appids (e.g. just added)
 */
function syncAll(opts = {}) {
  if (running) return running;
  running = doSync(opts).finally(() => { running = null; });
  return running;
}

async function doSync({ force = false, only = null, reason = 'manual' } = {}) {
  const cred = credentials();
  if (!cred.key || !cred.steamId) {
    const res = { ok: false, error: 'missing_credentials', synced: 0 };
    emit('sync:done', res);
    return res;
  }
  emit('sync:start', { reason });

  // Refresh names / hours / covers for all games with a single call.
  let owned = [];
  try {
    owned = await steam.getOwnedGames(cred);
  } catch (err) {
    const res = { ok: false, error: err.kind || 'network', synced: 0 };
    emit('sync:done', res);
    return res;
  }
  const ownedMap = new Map(owned.map(g => [g.appid, g]));
  const now = Date.now();
  const toSync = [];
  const ids = only ? only.map(Number) : data.getSelected();

  for (const id of ids) {
    const g = data.getGame(id);
    if (!g) continue;
    const og = ownedMap.get(id);
    if (og) {
      data.patchGame(id, {
        name: og.name,
        hours: og.playtimeMinutes / 60,
        playtimeMinutes: og.playtimeMinutes,
        lastPlayedSec: og.lastPlayedSec || g.lastPlayedSec || 0,
        coverUrl: g.coverUrl || og.coverUrl,
        owned: true
      });
    }
    const playtimeChanged = og && og.playtimeMinutes !== g.playtimeAtSync;
    const stale = !g.achSyncedAt || now - g.achSyncedAt > STALE_GAME;
    // Steam updates playtime only when a session ends, so also refresh games
    // played in the last 3 days and the ones marked "in progress".
    const lastPlayed = (og && og.lastPlayedSec) || g.lastPlayedSec || 0;
    const recentlyPlayed = lastPlayed && now - lastPlayed * 1000 < 3 * DAY;
    const active = g.status === 'in_progress';
    if (force || only || stale || playtimeChanged || recentlyPlayed || active) toSync.push(id);
  }

  const result = { ok: true, synced: 0, errors: 0, newlyUnlocked: 0, completed: [], newAch: [] };
  let fatal = null;
  for (let i = 0; i < toSync.length; i++) {
    const id = toSync[i];
    const g = data.getGame(id);
    emit('sync:progress', { done: i, total: toSync.length, name: (g && g.name) || `App ${id}` });
    try {
      const r = await syncGame(id);
      result.synced++;
      if (r) {
        result.newlyUnlocked += r.newlyUnlocked.length;
        if (r.completed) result.completed.push({ appid: r.appid, name: r.name });
        if (r.newAchAlert) result.newAch.push(r.name);
      }
    } catch (err) {
      result.errors++;
      data.patchGame(id, { syncError: err.kind || 'error' });
      if (err.kind === 'auth' || err.kind === 'private' || err.kind === 'ratelimit') { fatal = err.kind; break; }
    }
  }

  if (fatal) { result.ok = false; result.error = fatal; }
  if (!only) data.setLastSync(Date.now());
  result.at = data.getLastSync();
  result.checked = ids.length;

  emit('sync:done', result);
  return result;
}

let unlockNotifs = 0;
function notifyResult(r) {
  if (r.completed) notify({ kind: 'completed', body: r.name });
  else if (r.newlyUnlocked && r.newlyUnlocked.length) notifyUnlocks(r);
  if (r.newAchAlert) notify({ kind: 'newAch', body: r.name });
}
function notifyUnlocks(r) {
  if (unlockNotifs > 5) return; // avoid flooding after a long time offline
  unlockNotifs++;
  const tm = setTimeout(() => { unlockNotifs = Math.max(0, unlockNotifs - 1); }, 60000);
  if (tm.unref) tm.unref();
  notify({ kind: 'unlocked', body: r.name, count: r.newlyUnlocked.length });
}

// ---------- scheduling ----------
function schedule() {
  if (timer) clearInterval(timer);
  const minutes = Math.max(data.MIN_SYNC_MINUTES, Number(data.getSettings().syncMinutes) || 30);
  timer = setInterval(() => { syncAll({ reason: 'auto' }).catch(() => {}); }, minutes * 60000);
}

function stop() { if (timer) clearInterval(timer); timer = null; }

/** Achievements for the UI, with file:// URLs for cached icons. */
function achievementsForUI(appid) {
  const ach = data.getAchGame(appid);
  return Object.values(ach.list || {}).map(a => ({
    ...a,
    iconUrl: steam.normalizeIconUrl(a.iconUrl),
    iconGrayUrl: steam.normalizeIconUrl(a.iconGrayUrl),
    localIconUrl: a.localIconPath && exists(a.localIconPath) ? pathToFileURL(a.localIconPath).href : '',
    localGrayIconUrl: a.localGrayIconPath && exists(a.localGrayIconPath) ? pathToFileURL(a.localGrayIconPath).href : ''
  }));
}

module.exports = { configure, syncAll, syncGame, schedule, stop, isRunning, achievementsForUI };
