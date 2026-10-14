'use strict';
// Data layer: library (games + settings), achievements and change history.
// Handles migration from the 1.1/1.2 format (single electron-store file).

const fs = require('fs');
const path = require('path');
const { JsonStore } = require('./jsonStore');

const SCHEMA_VERSION = 3;
const MIN_SYNC_MINUTES = 15;
const MAX_CHANGES = 10000;

const DEFAULT_SETTINGS = {
  steamApiKey: '',        // only used when OS encryption is not available
  steamApiKeyEnc: '',     // base64, encrypted with Electron safeStorage
  steamId: '',
  language: 'english',    // UI language: 'english' | 'spanish'
  achLanguage: 'auto',    // language for achievement names ('auto' = follow UI)
  syncMinutes: 30,
  themeAccent: '#C832A0',
  notifications: true,
  yearlyGoal: 0,
  closeToTray: true,      // closing the window keeps the app in the system tray
  startWithWindows: false,
  hltbEnabled: true       // look up HowLongToBeat times
};

// Built-in achievement tags. 'bugged' is only a label: it does not change difficulty or progress.
const ACH_TAGS = ['missable', 'online', 'coop', 'grind', 'hard', 'bugged'];
const MAX_CUSTOM_TAGS = 50;
const CUSTOM_TAG_ID = /^c_[a-z0-9]{4,16}$/;

// Fields the renderer is allowed to change on a game.
const EDITABLE_GAME_FIELDS = [
  'status', 'rating', 'difficulty', 'manualHours', 'genrePrimary', 'genreSecondary',
  'genreLocked', 'notes', 'priority', 'newAchAlert', 'collections', 'hltbManual'
];

let safeStorage = null;
let library = null;   // JsonStore
let achStore = null;  // JsonStore
let userDataDir = '';
let initLocale = '';

function init({ userData, safeStorage: ss, locale }) {
  userDataDir = userData;
  initLocale = locale || '';
  safeStorage = ss || null;
  // Note: no schemaVersion default, so files from 1.x are detected as version 2.
  library = new JsonStore(path.join(userData, 'library.json'), {
    settings: { ...DEFAULT_SETTINGS },
    selectedAppIds: [],
    games: {},
    achievementChanges: [],
    lastSync: 0,
    windowState: null
  });
  achStore = new JsonStore(path.join(userData, 'achievements.json'), { games: {} }, { delay: 800 });
  migrate();
}

// ---------- migration ----------
function migrate() {
  const d = library.data;
  const from = Number(d.schemaVersion) || 2;
  const fresh = !fs.existsSync(library.file);
  if (fresh) {
    // First run: use the system language.
    d.settings = { ...d.settings, language: /^es/i.test(String(initLocale || '')) ? 'spanish' : 'english' };
  }
  if (fresh || (from >= SCHEMA_VERSION && !d.achievements)) { d.schemaVersion = SCHEMA_VERSION; normalize(); return; }

  // Keep a copy of the old file before touching anything.
  try {
    const src = library.file;
    const backup = path.join(userDataDir, `library.backup-v${from}-${Date.now()}.json`);
    if (fs.existsSync(src)) fs.copyFileSync(src, backup);
  } catch {}

  // 1.x stored achievements inside library.json as { appid: { apiName: ach } }.
  if (d.achievements && typeof d.achievements === 'object') {
    const games = achStore.data.games || {};
    for (const [appid, map] of Object.entries(d.achievements)) {
      if (!map || typeof map !== 'object') continue;
      games[appid] = convertLegacyAchGame(map);
    }
    achStore.data.games = games;
    achStore.flush();
    delete d.achievements;
  }

  // Old default/allowed sync interval could be 1–5 min: too aggressive for Steam's API limits.
  const s = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  if (!Number(s.syncMinutes) || Number(s.syncMinutes) < MIN_SYNC_MINUTES) s.syncMinutes = 30;
  d.settings = s;

  d.schemaVersion = SCHEMA_VERSION;
  normalize();
  library.flush();
}

function convertLegacyAchGame(map) {
  if (map.list && map.meta) return map; // already new format
  const list = {};
  for (const [apiName, a] of Object.entries(map)) {
    if (!a || typeof a !== 'object') continue;
    list[apiName] = { ...a, achievementApiName: a.achievementApiName || apiName };
  }
  return { meta: { schemaAt: 0, pctAt: 0, lang: '' }, list };
}

function normalize() {
  const d = library.data;
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  if (!d.games || typeof d.games !== 'object') d.games = {};
  if (!Array.isArray(d.selectedAppIds)) d.selectedAppIds = [];
  if (!Array.isArray(d.achievementChanges)) d.achievementChanges = [];
  if (!Array.isArray(d.ignoredAppIds)) d.ignoredAppIds = [];
  d.customTags = sanitizeCustomTags(d.customTags);
  // Every game in the library must be in the sync list and vice versa.
  const ids = new Set(d.selectedAppIds.map(Number).filter(Boolean));
  for (const k of Object.keys(d.games)) ids.add(Number(k));
  d.selectedAppIds = [...ids];
  for (const id of ids) {
    if (!d.games[id]) d.games[id] = { appid: id, name: '', createdAt: Date.now() };
  }
  if (!achStore.data.games || typeof achStore.data.games !== 'object') achStore.data.games = {};
  // Move plain-text API key into OS-encrypted storage when possible.
  if (d.settings.steamApiKey && canEncrypt()) {
    setApiKey(d.settings.steamApiKey);
  }
}

// ---------- settings / API key ----------
function canEncrypt() {
  try {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) return false;
    // Linux without a keyring (GNOME Keyring / KWallet) falls back to a hard-coded password:
    // that is not real encryption, so do not claim it is.
    if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function' &&
        safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
    return true;
  } catch { return false; }
}

function getSettings() { return library.data.settings; }

function setSettings(patch) {
  const allowed = ['steamId', 'language', 'achLanguage', 'syncMinutes', 'themeAccent', 'notifications', 'yearlyGoal', 'closeToTray', 'startWithWindows', 'hltbEnabled'];
  const s = { ...getSettings() };
  for (const k of allowed) if (patch && k in patch) s[k] = patch[k];
  s.syncMinutes = Math.max(MIN_SYNC_MINUTES, Math.round(Number(s.syncMinutes) || 30));
  s.yearlyGoal = Math.max(0, Math.round(Number(s.yearlyGoal) || 0));
  s.notifications = !!s.notifications;
  s.closeToTray = !!s.closeToTray;
  s.startWithWindows = !!s.startWithWindows;
  s.hltbEnabled = !!s.hltbEnabled;
  if (!['english', 'spanish'].includes(s.language)) s.language = 'english';
  if (!/^#[0-9a-f]{6}$/i.test(String(s.themeAccent || ''))) s.themeAccent = DEFAULT_SETTINGS.themeAccent;
  library.set('settings', s);
  return s;
}

function getApiKey() {
  const s = getSettings();
  if (s.steamApiKeyEnc && canEncrypt()) {
    try { return safeStorage.decryptString(Buffer.from(s.steamApiKeyEnc, 'base64')); } catch {}
  }
  return String(s.steamApiKey || '').trim();
}

function setApiKey(key) {
  const k = String(key || '').trim();
  const s = { ...getSettings() };
  if (!k) { s.steamApiKey = ''; s.steamApiKeyEnc = ''; }
  else if (canEncrypt()) {
    s.steamApiKeyEnc = safeStorage.encryptString(k).toString('base64');
    s.steamApiKey = '';
  } else {
    s.steamApiKey = k;
    s.steamApiKeyEnc = '';
  }
  library.set('settings', s);
}

/** Settings safe to send to the renderer (no key). */
function publicSettings() {
  const { steamApiKey, steamApiKeyEnc, ...rest } = getSettings();
  return { ...rest, hasApiKey: !!getApiKey(), keyEncrypted: !!steamApiKeyEnc };
}

/** Language used for Steam API texts (achievement names, etc.). */
function steamLanguage() {
  const s = getSettings();
  if (s.achLanguage && s.achLanguage !== 'auto') return s.achLanguage;
  return s.language === 'spanish' ? 'spanish' : 'english';
}

// ---------- games ----------
function getGames() { return library.data.games; }
function getGame(appid) { return library.data.games[Number(appid)] || null; }
function getSelected() { return library.data.selectedAppIds.slice(); }
function hasGame(appid) { return !!library.data.games[Number(appid)]; }

/** Create a game only if it does not exist. Returns true when created. */
function createGame(appid, base) {
  const id = Number(appid);
  if (!id || hasGame(id)) return false;
  const now = Date.now();
  library.data.games[id] = {
    appid: id, name: '', hours: 0, coverUrl: '', genrePrimary: '', genreSecondary: '',
    genreLocked: false, manualHours: null, notes: '', status: '', rating: null, difficulty: null,
    achUnlocked: 0, achTotal: 0, createdAt: now, updatedAt: now,
    ...(base || {}), appid: id
  };
  if (!library.data.selectedAppIds.includes(id)) library.data.selectedAppIds.push(id);
  library.save();
  return true;
}

/** Internal update (sync etc.). */
function patchGame(appid, patch) {
  const id = Number(appid);
  const g = library.data.games[id];
  if (!g) return null;
  Object.assign(g, patch, { appid: id });
  library.save();
  return g;
}

/** Update from the UI: only whitelisted fields, validated. */
function updateGameFromUI(appid, patch) {
  const clean = {};
  for (const k of EDITABLE_GAME_FIELDS) if (patch && k in patch) clean[k] = patch[k];
  if ('rating' in clean) clean.rating = clampIntOrNull(clean.rating, 1, 100);
  if ('difficulty' in clean) clean.difficulty = clampIntOrNull(clean.difficulty, 1, 10);
  if ('manualHours' in clean) {
    const n = Number(clean.manualHours);
    clean.manualHours = Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
  }
  if ('priority' in clean) clean.priority = clean.priority == null ? null : Number(clean.priority);
  if ('status' in clean && !['', 'in_progress', 'possible_100', 'paused'].includes(clean.status)) clean.status = '';
  for (const k of ['notes', 'genrePrimary', 'genreSecondary']) {
    if (k in clean) clean[k] = String(clean[k] || '').slice(0, k === 'notes' ? 5000 : 80);
  }
  if ('newAchAlert' in clean) clean.newAchAlert = null; // UI can only dismiss it
  if ('collections' in clean) {
    const list = Array.isArray(clean.collections) ? clean.collections : [];
    clean.collections = Array.from(new Set(list.map(c => String(c || '').trim().slice(0, 40)).filter(Boolean))).slice(0, 20);
  }
  if ('hltbManual' in clean) {
    const n = Number(clean.hltbManual);
    clean.hltbManual = Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
  }
  clean.updatedAt = Date.now();
  return patchGame(appid, clean);
}

function clampIntOrNull(v, min, max) {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function reorderPriorities(appids) {
  (appids || []).forEach((id, i) => {
    const g = library.data.games[Number(id)];
    if (g) g.priority = i + 1;
  });
  library.save();
}

function removeGame(appid) {
  const id = Number(appid);
  const existed = !!library.data.games[id];
  delete library.data.games[id];
  library.data.selectedAppIds = library.data.selectedAppIds.filter(x => Number(x) !== id);
  library.data.achievementChanges = library.data.achievementChanges.filter(c => Number(c.appId) !== id);
  library.save();
  delete achStore.data.games[id];
  achStore.save();
  try { fs.rmSync(achievementIconDir(id), { recursive: true, force: true }); } catch {}
  return existed;
}

function getIgnored() { return (library.data.ignoredAppIds || []).slice(); }
function setIgnored(appid, ignored) {
  const id = Number(appid);
  const set = new Set(library.data.ignoredAppIds || []);
  if (ignored) set.add(id); else set.delete(id);
  library.data.ignoredAppIds = [...set];
  library.save();
  return library.data.ignoredAppIds;
}

// ---------- achievements ----------
function achievementIconDir(appid) { return path.join(userDataDir, 'achievement-icons', String(appid)); }

function getAchGame(appid) {
  const id = Number(appid);
  let g = achStore.data.games[id];
  if (!g) return { meta: { schemaAt: 0, pctAt: 0, lang: '' }, list: {} };
  if (!g.list) { g = convertLegacyAchGame(g); achStore.data.games[id] = g; }
  return g;
}

function setAchGame(appid, value) {
  achStore.data.games[Number(appid)] = value;
  achStore.save();
}

function updateAchievementUserData(appid, apiName, patch) {
  const g = getAchGame(appid);
  const a = g.list[apiName];
  if (!a) return null;
  if (patch && 'userNote' in patch) a.userNote = String(patch.userNote || '').slice(0, 2000);
  if (patch && 'missable' in patch) a.missable = !!patch.missable;
  if (patch && Array.isArray(patch.tags)) {
    a.tags = Array.from(new Set(patch.tags.filter(isValidTag)));
    a.missable = a.tags.includes('missable');
  } else if (patch && 'missable' in patch) {
    const tags = new Set(a.tags || []);
    if (a.missable) tags.add('missable'); else tags.delete('missable');
    a.tags = [...tags];
  }
  setAchGame(appid, g);
  return a;
}

function allAchievements() { return achStore.data.games; }

// ---------- custom achievement tags ----------
// Stored in library.json as [{ id: 'c_xxxx', name, icon }]. Achievements reference them by id.
function firstGrapheme(str) {
  const s = String(str || '').trim();
  if (!s) return '';
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    for (const { segment } of seg.segment(s)) return segment.slice(0, 16);
  } catch {}
  return Array.from(s)[0] || '';
}
function cleanTagName(name) { return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24); }

function sanitizeCustomTags(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  for (const t of list) {
    if (!t || typeof t !== 'object') continue;
    const id = String(t.id || '');
    const name = cleanTagName(t.name);
    if (!CUSTOM_TAG_ID.test(id) || !name || ids.has(id)) continue;
    ids.add(id);
    out.push({ id, name, icon: firstGrapheme(t.icon) || '🏷️' });
    if (out.length >= MAX_CUSTOM_TAGS) break;
  }
  return out;
}

function getCustomTags() { return (library.data.customTags || []).map(t => ({ ...t })); }

function isValidTag(tag) {
  return ACH_TAGS.includes(tag) || (library.data.customTags || []).some(t => t.id === tag);
}

function newTagId() {
  const used = new Set((library.data.customTags || []).map(t => t.id));
  let id;
  do { id = 'c_' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'); } while (used.has(id));
  return id;
}

/** Creates a custom tag. A tag with the same name (any case) is reused instead of duplicated. */
function createCustomTag({ name, icon } = {}) {
  const n = cleanTagName(name);
  if (!n) return { ok: false, error: 'tag_name_required' };
  const list = getCustomTags();
  const existing = list.find(t => t.name.toLowerCase() === n.toLowerCase());
  if (existing) return { ok: true, tag: existing, existed: true };
  if (list.length >= MAX_CUSTOM_TAGS) return { ok: false, error: 'tag_limit' };
  const tag = { id: newTagId(), name: n, icon: firstGrapheme(icon) || '🏷️' };
  library.set('customTags', [...list, tag]);
  return { ok: true, tag };
}

function updateCustomTag(id, { name, icon } = {}) {
  const list = getCustomTags();
  const tag = list.find(t => t.id === id);
  if (!tag) return { ok: false, error: 'not_found' };
  if (name !== undefined) {
    const n = cleanTagName(name);
    if (!n) return { ok: false, error: 'tag_name_required' };
    if (list.some(t => t.id !== id && t.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: 'tag_exists' };
    tag.name = n;
  }
  if (icon !== undefined) tag.icon = firstGrapheme(icon) || '🏷️';
  library.set('customTags', list);
  return { ok: true, tag };
}

/** Deletes a custom tag and removes it from every achievement. Returns how many achievements had it. */
function deleteCustomTag(id) {
  const list = getCustomTags();
  if (!list.some(t => t.id === id)) return { ok: false, error: 'not_found' };
  library.set('customTags', list.filter(t => t.id !== id));
  let removed = 0;
  for (const g of Object.values(achStore.data.games || {})) {
    for (const a of Object.values((g && g.list) || {})) {
      if (Array.isArray(a.tags) && a.tags.includes(id)) { a.tags = a.tags.filter(x => x !== id); removed++; }
    }
  }
  if (removed) achStore.save();
  return { ok: true, removed };
}

/** Number of achievements using each tag (built-in and custom). */
function tagUsage() {
  const usage = {};
  for (const g of Object.values(achStore.data.games || {})) {
    for (const a of Object.values((g && g.list) || {})) {
      for (const tg of (Array.isArray(a.tags) ? a.tags : [])) usage[tg] = (usage[tg] || 0) + 1;
    }
  }
  return usage;
}

// ---------- history ----------
function pushChanges(list) {
  if (!list || !list.length) return;
  const all = library.data.achievementChanges;
  all.push(...list);
  if (all.length > MAX_CHANGES) all.splice(0, all.length - MAX_CHANGES);
  library.save();
}
function getChanges(appid) {
  const id = Number(appid);
  return library.data.achievementChanges.filter(c => Number(c.appId) === id);
}

// ---------- misc ----------
function getLastSync() { return library.data.lastSync || 0; }
function setLastSync(ts) { library.set('lastSync', ts); }
function getWindowState() { return library.data.windowState; }
/** Public Steam profile info (name, avatar), cached from GetPlayerSummaries. */
function getProfile() { return library.data.profile || null; }
function setProfile(p) {
  const cur = library.data.profile || {};
  const next = { personaName: String((p && p.personaName) || '').slice(0, 64), avatar: String((p && p.avatar) || '') };
  if (cur.personaName === next.personaName && cur.avatar === next.avatar) return;
  library.set('profile', next);
}
function setWindowState(ws) { library.set('windowState', ws); }

// ---------- backup ----------
function exportPayload() {
  const { steamApiKey, steamApiKeyEnc, ...settings } = getSettings();
  return {
    app: 'platinum-path',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings, // API key intentionally excluded
    selectedAppIds: getSelected(),
    games: getGames(),
    achievements: achStore.data.games,
    achievementChanges: library.data.achievementChanges,
    ignoredAppIds: getIgnored(),
    customTags: getCustomTags(),
    lastSync: getLastSync()
  };
}

/** Validates a backup (v2 or v3). Returns { ok, error, summary, apply() }. */
function parseBackup(json) {
  if (!json || typeof json !== 'object') return { ok: false, error: 'invalid_file' };
  let games, selected, achievements, changes, settings, lastSync;
  if (json.version >= 3 && json.games) {
    ({ games, achievements, settings, lastSync } = json);
    selected = json.selectedAppIds;
    changes = json.achievementChanges;
  } else {
    // v2 (1.1/1.2): { version: 2, data: store.store, achievements, achievementChanges } or raw store
    const data = json.data || json;
    games = data.games;
    selected = data.selectedAppIds;
    settings = data.settings;
    lastSync = data.lastSync;
    achievements = json.achievements || data.achievements;
    changes = json.achievementChanges || data.achievementChanges;
  }
  if (!games || typeof games !== 'object' || Array.isArray(games)) return { ok: false, error: 'invalid_file' };
  const validGames = {};
  for (const [k, g] of Object.entries(games)) {
    const id = Number(k);
    if (id > 0 && g && typeof g === 'object') validGames[id] = { ...g, appid: id };
  }
  const convertedAch = {};
  if (achievements && typeof achievements === 'object') {
    for (const [k, v] of Object.entries(achievements)) {
      if (Number(k) > 0 && v && typeof v === 'object') convertedAch[Number(k)] = convertLegacyAchGame(v);
    }
  }
  return {
    ok: true,
    summary: { games: Object.keys(validGames).length },
    apply() {
      const cur = getSettings();
      const nextSettings = { ...cur };
      // Keep the current API key; import other preferences.
      if (settings && typeof settings === 'object') {
        for (const k of ['steamId', 'language', 'achLanguage', 'syncMinutes', 'themeAccent', 'notifications', 'yearlyGoal', 'closeToTray', 'startWithWindows', 'hltbEnabled']) {
          if (k in settings) nextSettings[k] = settings[k];
        }
      }
      // Old backups may contain a plain API key: use it only if we have none.
      const legacyKey = (!getApiKey() && settings && settings.steamApiKey) ? String(settings.steamApiKey) : '';
      const keepEnc = cur.steamApiKeyEnc, keepPlain = cur.steamApiKey;
      library.replaceAll({
        schemaVersion: SCHEMA_VERSION,
        settings: nextSettings,
        selectedAppIds: Array.isArray(selected) ? selected : Object.keys(validGames).map(Number),
        games: validGames,
        achievementChanges: Array.isArray(changes) ? changes.slice(-MAX_CHANGES) : [],
        lastSync: Number(lastSync) || 0,
        ignoredAppIds: Array.isArray(json.ignoredAppIds) ? json.ignoredAppIds.map(Number).filter(Boolean) : [],
        customTags: sanitizeCustomTags(json.customTags),
        windowState: library.data.windowState
      });
      achStore.replaceAll({ games: convertedAch });
      library.data.settings.steamApiKeyEnc = keepEnc || '';
      library.data.settings.steamApiKey = keepPlain || '';
      normalize();
      setSettings(nextSettings);
      if (legacyKey) setApiKey(legacyKey);
      library.flush();
      achStore.flush();
    }
  };
}

function flushAll() {
  try { library && library.flush(); } catch {}
  try { achStore && achStore.flush(); } catch {}
}

module.exports = {
  init, flushAll, MIN_SYNC_MINUTES,
  getSettings, setSettings, publicSettings, getApiKey, setApiKey, canEncrypt, steamLanguage,
  getIgnored, setIgnored, ACH_TAGS,
  getCustomTags, createCustomTag, updateCustomTag, deleteCustomTag, tagUsage, sanitizeCustomTags,
  getGames, getGame, getSelected, hasGame, createGame, patchGame, updateGameFromUI, reorderPriorities, removeGame,
  achievementIconDir, getAchGame, setAchGame, updateAchievementUserData, allAchievements,
  pushChanges, getChanges,
  getLastSync, setLastSync, getWindowState, setWindowState, getProfile, setProfile,
  exportPayload, parseBackup,
  // exposed for tests
  _convertLegacyAchGame: convertLegacyAchGame
};
