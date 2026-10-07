'use strict';
// HowLongToBeat lookups ("time to 100%").
// HowLongToBeat has NO official API: this follows what its website does
// (same approach as the howlongtobeatpy library). If they change the site it
// can stop working; the app then simply shows nothing and the user can type the
// hours by hand.

const data = require('./data');

const BASE = 'https://howlongtobeat.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const CACHE_OK = 30 * 24 * 3600 * 1000;      // found: refresh monthly
const CACHE_MISS = 7 * 24 * 3600 * 1000;     // not found / error: retry weekly
const GAP_MS = 2500;

let fetchImpl = (...a) => fetch(...a);
function _setFetch(fn) { fetchImpl = fn; }

let searchPath = null;       // e.g. "api/s"
let searchPathAt = 0;
let chain = Promise.resolve();
let lastCall = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(url, opts = {}) {
  return fetchImpl(url, { ...opts, headers: { 'User-Agent': UA, Referer: BASE, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
}

/** Find the search endpoint used by the website's JavaScript. */
async function discoverSearchPath() {
  if (searchPath && Date.now() - searchPathAt < 12 * 3600 * 1000) return searchPath;
  try {
    const home = await get(BASE);
    const html = await home.text();
    const scripts = Array.from(html.matchAll(/<script[^>]+src="([^"]*\/_next\/static\/chunks\/[^"]+)"/g)).map(m => m[1]);
    const re = /fetch\s*\(\s*["'`]\/api\/([a-zA-Z0-9_/]+)[^"'`]*["'`]\s*,\s*\{[^}]*method:\s*["']POST["']/i;
    for (const src of scripts) {
      const url = src.startsWith('http') ? src : BASE + src.replace(/^\//, '');
      try {
        const js = await (await get(url)).text();
        const m = js.match(re);
        if (m) { searchPath = `api/${m[1].replace(/\/$/, '')}`; searchPathAt = Date.now(); return searchPath; }
      } catch {}
    }
  } catch {}
  searchPath = 'api/s';
  searchPathAt = Date.now();
  return searchPath;
}

async function getAuth(path) {
  try {
    const res = await get(`${BASE}${path}/init?t=${Date.now()}`);
    if (!res.ok) return null;
    const j = await res.json();
    const auth = { token: j.token };
    for (const [k, v] of Object.entries(j)) {
      if (/key/i.test(k)) auth.key = v;
      else if (/val/i.test(k)) auth.val = v;
    }
    return auth;
  } catch { return null; }
}

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  // Levenshtein distance
  const dp = Array.from({ length: shorter.length + 1 }, (_, i) => i);
  for (let i = 1; i <= longer.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= shorter.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (longer[i - 1] === shorter[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return (longer.length - dp[shorter.length]) / longer.length;
}

/** Pick the best result: exact Steam AppID match first, then the most similar name. */
function pickBest(results, name, appid) {
  if (!Array.isArray(results) || !results.length) return null;
  const bySteam = results.find(r => Number(r.profile_steam) === Number(appid));
  if (bySteam) return bySteam;
  let best = null, score = 0;
  for (const r of results) {
    const s = similarity(name, r.game_name);
    if (s > score) { score = s; best = r; }
  }
  return score >= 0.6 ? best : null;
}

function cleanName(name) {
  return String(name || '').replace(/[™®©]/g, '').replace(/\s*[-–:]\s*(game of the year|goty|definitive|complete|remastered|anniversary)( edition)?$/i, '').trim();
}

async function search(name, appid) {
  const path = await discoverSearchPath();
  const auth = await getAuth(path);
  const terms = cleanName(name).split(/\s+/).filter(Boolean);
  const payload = {
    searchType: 'games', searchTerms: terms, searchPage: 1, size: 20,
    searchOptions: {
      games: { userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main', rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' }, rangeYear: { max: '', min: '' }, modifier: 'hide_dlc' },
      users: { sortCategory: 'postcount' }, lists: { sortCategory: 'follows' }, filter: '', sort: 0, randomizer: 0
    },
    useCache: true
  };
  const headers = { 'content-type': 'application/json', accept: '*/*', Origin: BASE.replace(/\/$/, '') };
  if (auth) {
    if (auth.token) headers['x-auth-token'] = String(auth.token);
    if (auth.key) { headers['x-hp-key'] = String(auth.key); headers['x-hp-val'] = String(auth.val); payload[auth.key] = auth.val; }
  }
  const res = await get(BASE + path, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    if (res.status === 404 || res.status === 403) searchPath = null; // force rediscovery next time
    throw new Error(`HLTB ${res.status}`);
  }
  const j = await res.json();
  const best = pickBest(j && j.data, cleanName(name), appid);
  if (!best) return null;
  const h = (sec) => (Number(sec) > 0 ? Math.round((Number(sec) / 3600) * 10) / 10 : null);
  return { id: best.game_id, name: best.game_name, comp100: h(best.comp_100), compMain: h(best.comp_main), compPlus: h(best.comp_plus) };
}

/** Lookup with cache and rate limiting. Returns the stored game.hltb object. */
function lookup(appid, { force = false } = {}) {
  const run = async () => {
    const g = data.getGame(appid);
    if (!g || !g.name) return null;
    const c = g.hltb;
    if (!force && c && c.at && Date.now() - c.at < (c.notFound || c.error ? CACHE_MISS : CACHE_OK)) return c;
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let value;
    try {
      const r = await search(g.name, g.appid);
      value = r ? { ...r, at: Date.now() } : { notFound: true, at: Date.now() };
    } catch (err) {
      value = { error: true, at: Date.now() };
    }
    data.patchGame(appid, { hltb: value });
    return value;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

module.exports = { lookup, _setFetch, _similarity: similarity, _pickBest: pickBest };
