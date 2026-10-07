'use strict';
// Pure achievement logic (no Electron, no I/O) so it can be unit-tested.

const DIFF_STEPS = [[50, 1], [30, 2], [20, 3], [12, 4], [7, 5], [4, 6], [2, 7], [1, 8], [0.3, 9]];
function stepFor(p) {
  for (const [min, d] of DIFF_STEPS) if (p >= min) return d;
  return 10;
}

/**
 * Estimated 100% difficulty (1–10) from global unlock percentages.
 * The rarest achievement usually decides how hard a 100% is, but a single isolated
 * outlier (a bugged achievement, or one only cheaters have) should not push a game
 * to 10/10 on its own: when the rarest one is 4× rarer than the next and the game has
 * at least 5 achievements, the estimate goes down one step.
 */
function estimateDifficulty(percentages) {
  const vals = (percentages || []).map(Number).filter(n => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!vals.length) return null;
  let d = stepFor(vals[0]);
  const isolated = vals.length >= 5 && vals[1] >= vals[0] * 4 && stepFor(vals[1]) < d;
  if (isolated && d >= 7) d -= 1;
  return d;
}

/**
 * Merge Steam data into the locally stored achievement list.
 * - Keeps achievements Steam no longer reports (marked preservedLocalOnly).
 * - Keeps user fields (userNote, missable).
 * - Returns the list of changes (unlocked / added / removed / relocked).
 */
function mergeAchievements({ appid, prevList, schema, player, globalPct, nowIso, firstSync }) {
  const list = {};
  const changes = [];
  const playerMap = new Map((player || []).map(a => [a.apiname, a]));
  const schemaList = Array.isArray(schema) ? schema : null;

  // Base set of names: schema when available, otherwise what we had + what the player API reports.
  const names = schemaList
    ? schemaList.map(s => s.apiName)
    : Array.from(new Set([...Object.keys(prevList || {}), ...playerMap.keys()]));
  const schemaMap = new Map((schemaList || []).map(s => [s.apiName, s]));

  for (const apiName of names) {
    const sch = schemaMap.get(apiName) || {};
    const prev = (prevList || {})[apiName] || {};
    const p = playerMap.get(apiName);
    const havePlayer = !!player;
    const unlocked = havePlayer ? (p ? Number(p.achieved) === 1 : !!prev.unlocked) : !!prev.unlocked;
    const t = havePlayer && p ? Number(p.unlocktime) : 0;
    const unlockTimeSec = unlocked ? (t > 0 ? t : (prev.unlockTimeSec || null)) : null;
    const pct = globalPct && apiName in globalPct ? globalPct[apiName] : (prev.globalPct ?? null);

    const next = {
      appId: Number(appid),
      achievementApiName: apiName,
      displayName: sch.displayName || prev.displayName || (p && p.name) || apiName,
      description: sch.description || prev.description || (p && p.description) || '',
      hidden: typeof sch.hidden === 'boolean' ? sch.hidden : !!prev.hidden,
      unlocked,
      unlockTimeSec,
      unlockDate: unlockTimeSec ? new Date(unlockTimeSec * 1000).toISOString() : null,
      iconUrl: sch.icon || prev.iconUrl || '',
      iconGrayUrl: sch.icongray || prev.iconGrayUrl || '',
      localIconPath: prev.localIconPath || '',
      localGrayIconPath: prev.localGrayIconPath || '',
      globalPct: pct,
      userNote: prev.userNote || '',
      missable: !!prev.missable,
      tags: Array.isArray(prev.tags) ? prev.tags : (prev.missable ? ['missable'] : []),
      firstSeenAt: prev.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
      lastSyncedAt: nowIso,
      existsInCurrentSteamData: true,
      preservedLocalOnly: false
    };
    list[apiName] = next;

    const existedBefore = !!(prevList && prevList[apiName]);
    if (!existedBefore && !firstSync) {
      changes.push(change(appid, apiName, 'added', null, next.displayName, nowIso));
    }
    if (existedBefore && !prev.unlocked && unlocked) {
      changes.push(change(appid, apiName, 'unlocked', false, true, nowIso, unlockTimeSec));
    } else if (existedBefore && prev.unlocked && !unlocked && havePlayer) {
      changes.push(change(appid, apiName, 'relocked', true, false, nowIso));
    } else if (!existedBefore && firstSync === false && unlocked) {
      changes.push(change(appid, apiName, 'unlocked', false, true, nowIso, unlockTimeSec));
    }
  }

  // Achievements Steam removed: keep them locally, flagged.
  if (schemaList) {
    for (const [apiName, old] of Object.entries(prevList || {})) {
      if (list[apiName] || !old || typeof old !== 'object') continue;
      list[apiName] = { ...old, lastSyncedAt: nowIso, existsInCurrentSteamData: false, preservedLocalOnly: true };
      if (old.existsInCurrentSteamData !== false) changes.push(change(appid, apiName, 'removed', true, false, nowIso));
    }
  }
  return { list, changes };
}

function change(appId, apiName, type, oldValue, newValue, changedAt, unlockTimeSec) {
  const c = { appId: Number(appId), achievementApiName: apiName, changeType: type, oldValue, newValue, changedAt };
  if (unlockTimeSec) c.unlockTimeSec = unlockTimeSec;
  return c;
}

/** Game-level summary from the merged list (only achievements that still exist on Steam). */
function summarize(list) {
  const current = Object.values(list || {}).filter(a => a.existsInCurrentSteamData !== false);
  const total = current.length;
  const unlocked = current.filter(a => a.unlocked).length;
  let last = null;
  for (const a of current) if (a.unlocked && a.unlockTimeSec) last = Math.max(last || 0, a.unlockTimeSec);
  const pcts = current.map(a => a.globalPct).filter(p => p != null);
  return {
    achTotal: total,
    achUnlocked: unlocked,
    lastUnlockTimeSec: last,
    rarestPct: pcts.length ? Math.min(...pcts) : null,
    estDifficulty: estimateDifficulty(pcts)
  };
}

/**
 * Decide game-level completion state after a sync.
 * Detects "you had 100% and Steam added new achievements".
 */
function completionUpdate(prevGame, summary, nowMs) {
  const prevTotal = Number(prevGame.achTotal) || 0;
  const prevUnlocked = Number(prevGame.achUnlocked) || 0;
  const wasDone = prevTotal > 0 && prevUnlocked >= prevTotal;
  const isDone = summary.achTotal > 0 && summary.achUnlocked >= summary.achTotal;
  const out = {};
  if (isDone) {
    if (!prevGame.completedAtSec) out.completedAtSec = summary.lastUnlockTimeSec || Math.floor(nowMs / 1000);
    if (prevGame.newAchAlert) out.newAchAlert = null;
  } else if (wasDone && summary.achTotal > prevTotal) {
    out.newAchAlert = { at: nowMs, added: summary.achTotal - prevTotal };
  }
  out.justCompleted = isDone && !wasDone && prevTotal > 0;
  out.justCompletedFirst = isDone && !wasDone;
  return out;
}

module.exports = { estimateDifficulty, mergeAchievements, summarize, completionUpdate };
