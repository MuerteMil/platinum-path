'use strict';
// Steam Web API + Store API client.
// - Uses Node's built-in fetch (no node-fetch).
// - Classifies errors so the UI can explain what went wrong.
// - Store API calls go through a throttled queue (Steam returns 429 quickly).

const WEB_API = 'https://api.steampowered.com';
const STORE = 'https://store.steampowered.com';
const TIMEOUT_MS = 20000;
const STORE_GAP_MS = 1600;

class SteamError extends Error {
  constructor(kind, message, status) {
    super(message || kind);
    this.kind = kind;       // 'missing_credentials' | 'auth' | 'private' | 'ratelimit' | 'network' | 'http' | 'not_found'
    this.status = status || 0;
  }
}

let fetchImpl = (...args) => fetch(...args);
function _setFetch(fn) { fetchImpl = fn; } // tests

async function httpJson(url) {
  let res;
  try {
    res = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new SteamError('network', err && err.message);
  }
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, ok: res.ok, body };
}

function buildUrl(base, params) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function webApi(pathname, params) {
  const { status, ok, body } = await httpJson(buildUrl(WEB_API + pathname, params));
  if (ok) return body;
  const errText = JSON.stringify(body || '').toLowerCase();
  if (status === 401 || (status === 403 && !errText.includes('not public'))) throw new SteamError('auth', 'Invalid API key', status);
  if (status === 403) throw new SteamError('private', 'Profile is private', status);
  if (status === 429) throw new SteamError('ratelimit', 'Too many requests', status);
  const e = new SteamError('http', `Steam API error ${status}`, status);
  e.body = body;
  throw e;
}

// ---------- Web API ----------
async function resolveSteamId(input, key) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^7656\d{13}$/.test(raw)) return raw;
  const prof = raw.match(/steamcommunity\.com\/profiles\/(7656\d{13})/i);
  if (prof) return prof[1];
  const vanityMatch = raw.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  const vanity = vanityMatch ? vanityMatch[1] : raw;
  if (!/^[\w-]{2,64}$/.test(vanity)) throw new SteamError('not_found', 'Invalid profile');
  if (!key) throw new SteamError('missing_credentials', 'API key needed to resolve profile name');
  const data = await webApi('/ISteamUser/ResolveVanityURL/v1/', { key, vanityurl: vanity });
  const r = data && data.response;
  if (r && Number(r.success) === 1 && r.steamid) return String(r.steamid);
  throw new SteamError('not_found', 'Profile not found');
}

function headerUrl(appid) { return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`; }
/** True for the old generic header URL, which fails for many recent games (Steam now uses hashed paths). */
function isGenericHeader(url, appid) {
  return !url || url === headerUrl(appid) || /\/steam\/apps\/\d+\/header\.jpg(\?.*)?$/.test(url) && !/store_item_assets\/steam\/apps\/\d+\/[0-9a-f]{20,}\//.test(url);
}

// ---------- achievement icons ----------
// The schema still returns icons on the old steamcdn-a.akamaihd.net host, which no
// longer serves recent games (404). Steam's current host for community images serves
// both old and new ones, so icons are stored with that address and downloaded with a
// list of fallbacks. An address that ends in "/" has no file (no gray icon) and is empty.
const ICON_RE = /\/(?:steamcommunity\/public\/images|community_assets\/images)\/apps\/(\d+)\/([^/?#]+\.(?:jpe?g|png|gif))$/i;
function iconParts(url) {
  const m = ICON_RE.exec(String(url || '').split(/[?#]/)[0]);
  return m ? { appid: m[1], file: m[2] } : null;
}
function normalizeIconUrl(url) {
  const u = String(url || '').trim();
  if (!u || u.endsWith('/')) return '';
  const p = iconParts(u);
  return p ? `https://shared.fastly.steamstatic.com/community_assets/images/apps/${p.appid}/${p.file}` : u;
}
function iconCandidates(url) {
  const u = String(url || '').trim();
  if (!u || u.endsWith('/')) return [];
  const p = iconParts(u);
  if (!p) return [u];
  const path = `${p.appid}/${p.file}`;
  return Array.from(new Set([
    `https://shared.fastly.steamstatic.com/community_assets/images/apps/${path}`,
    `https://shared.akamai.steamstatic.com/community_assets/images/apps/${path}`,
    `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${path}`,
    u
  ]));
}

async function getOwnedGames({ key, steamId, language }) {
  if (!key || !steamId) throw new SteamError('missing_credentials');
  const data = await webApi('/IPlayerService/GetOwnedGames/v1/', {
    key, steamid: steamId, include_appinfo: true, include_played_free_games: true, language: language || 'english'
  });
  const resp = data && data.response;
  // A private profile ("Game details" private) returns an empty response with no game_count.
  if (resp && resp.game_count === undefined && !resp.games) throw new SteamError('private', 'Game details are private');
  return (resp.games || []).map(g => ({
    appid: Number(g.appid),
    name: g.name || `App ${g.appid}`,
    playtimeMinutes: Number(g.playtime_forever) || 0,
    lastPlayedSec: Number(g.rtime_last_played) || 0,
    hasStats: !!g.has_community_visible_stats,
    coverUrl: headerUrl(g.appid)
  }));
}

/** Returns { noStats: true } when the game has no achievements. */
async function getPlayerAchievements({ key, steamId, appid, language }) {
  try {
    const data = await webApi('/ISteamUserStats/GetPlayerAchievements/v1/', {
      key, steamid: steamId, appid, l: language || 'english'
    });
    const ps = data && data.playerstats;
    if (!ps || ps.success === false) return { noStats: true, list: [] };
    return { noStats: false, list: Array.isArray(ps.achievements) ? ps.achievements : [] };
  } catch (err) {
    const msg = JSON.stringify((err && err.body) || '').toLowerCase();
    if (err.kind === 'http' && err.status === 400 && (msg.includes('no stats') || msg.includes('stats'))) {
      return { noStats: true, list: [] };
    }
    if (err.kind === 'http' && err.status === 400 && msg.includes('not public')) {
      throw new SteamError('private', 'Profile is private', 403);
    }
    throw err;
  }
}

async function getSchema({ key, appid, language }) {
  const data = await webApi('/ISteamUserStats/GetSchemaForGame/v2/', { key, appid, l: language || 'english' });
  const list = (data && data.game && data.game.availableGameStats && data.game.availableGameStats.achievements) || [];
  return list.map(a => ({
    apiName: a.name || '',
    displayName: a.displayName || '',
    description: a.description || '',
    hidden: Number(a.hidden) === 1,
    icon: normalizeIconUrl(a.icon),
    icongray: normalizeIconUrl(a.icongray)
  })).filter(a => a.apiName);
}

/** Global unlock % per achievement. Does not need an API key. */
async function getGlobalPercentages(appid) {
  try {
    const data = await webApi('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appid });
    const list = (data && data.achievementpercentages && data.achievementpercentages.achievements) || [];
    const map = {};
    for (const a of list) {
      const p = Number(a.percent);
      if (a.name && Number.isFinite(p)) map[a.name] = Math.round(p * 100) / 100;
    }
    return map;
  } catch {
    return null;
  }
}

/** What the user is playing right now (needs a public profile). */
async function getPlayerSummary({ key, steamId }) {
  const data = await webApi('/ISteamUser/GetPlayerSummaries/v2/', { key, steamids: steamId });
  const p = data && data.response && data.response.players && data.response.players[0];
  if (!p) return null;
  return {
    gameId: p.gameid ? Number(p.gameid) : null,
    gameName: p.gameextrainfo || '',
    personaName: p.personaname || '',
    avatar: p.avatarfull || p.avatarmedium || ''
  };
}

// ---------- Store API (throttled) ----------
let storeChain = Promise.resolve();
let lastStoreCall = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function storeCall(url) {
  const run = async () => {
    const wait = lastStoreCall + STORE_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStoreCall = Date.now();
    let r = await httpJson(url);
    if (r.status === 429) {
      await sleep(60000);
      lastStoreCall = Date.now();
      r = await httpJson(url);
    }
    if (!r.ok) throw new SteamError(r.status === 429 ? 'ratelimit' : 'http', `Store error ${r.status}`, r.status);
    return r.body;
  };
  const p = storeChain.then(run, run);
  storeChain = p.catch(() => {});
  return p;
}

async function getAppDetails(appid) {
  try {
    const j = await storeCall(buildUrl(`${STORE}/api/appdetails`, { appids: appid, l: 'english' }));
    const data = j && j[String(appid)] && j[String(appid)].data;
    if (!data) return null;
    const genres = (data.genres || []).map(g => g.description).filter(Boolean);
    const ordered = genres.filter(g => g !== 'Indie').concat(genres.filter(g => g === 'Indie'));
    return {
      name: data.name || '',
      coverUrl: data.header_image || '',
      background: data.background_raw || data.background || '',
      description: data.short_description || '',
      genres: ordered
    };
  } catch {
    return null;
  }
}

async function searchStore(term, cc = 'US') {
  const j = await storeCall(buildUrl(`${STORE}/api/storesearch/`, { term, l: 'english', cc }));
  return ((j && j.items) || []).slice(0, 12).map(it => ({
    appid: Number(it.id),
    name: it.name || '',
    coverUrl: it.tiny_image || headerUrl(it.id)
  }));
}

async function downloadFile(url, filePath, fs) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  SteamError, resolveSteamId, getOwnedGames, getPlayerAchievements, getSchema, getGlobalPercentages,
  getAppDetails, searchStore, downloadFile, headerUrl, isGenericHeader, getPlayerSummary, _setFetch,
  normalizeIconUrl, iconCandidates
};
