'use strict';
// Detects the game being played right now (GetPlayerSummaries, 1 call every 2 min)
// and keeps its achievements fresh while you play.

const data = require('./data');
const steam = require('./steam');
const sync = require('./sync');

const POLL_MS = 2 * 60 * 1000;
const GAME_SYNC_MS = 4 * 60 * 1000;

let timer = null;
let current = null;          // { appid, name, inLibrary }
let lastGameSync = 0;
let emit = () => {};

function configure({ emitter }) { if (emitter) emit = emitter; }
function get() { return current; }

async function poll() {
  const key = data.getApiKey();
  const steamId = data.getSettings().steamId;
  if (!key || !steamId) return;
  let summary = null;
  try { summary = await steam.getPlayerSummary({ key, steamId }); } catch { return; }
  if (summary && summary.personaName) data.setProfile(summary);
  const appid = summary && summary.gameId;
  const prev = current;
  if (!appid) {
    current = null;
  } else {
    const g = data.getGame(appid);
    current = { appid, name: (g && g.name) || summary.gameName || `App ${appid}`, inLibrary: !!g, since: prev && prev.appid === appid ? prev.since : Date.now() };
  }
  const changed = (prev && prev.appid) !== (current && current.appid);
  if (changed) {
    emit('nowPlaying', current);
    // Game just closed: refresh it once more to catch the last achievements.
    if (prev && prev.inLibrary && !sync.isRunning()) sync.syncGame(prev.appid).then(() => emit('library:changed', { appids: [prev.appid] })).catch(() => {});
  }
  if (current && current.inLibrary && Date.now() - lastGameSync > GAME_SYNC_MS && !sync.isRunning()) {
    lastGameSync = Date.now();
    try {
      const r = await sync.syncGame(current.appid);
      emit('library:changed', { appids: [current.appid] });
      if (r && r.completed) emit('celebrate', { appid: current.appid, name: current.name });
    } catch {}
  }
}

function start() {
  stop();
  timer = setInterval(() => { poll().catch(() => {}); }, POLL_MS);
  setTimeout(() => poll().catch(() => {}), 6000);
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { configure, start, stop, get, poll };
