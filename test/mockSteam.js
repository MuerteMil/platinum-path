'use strict';
// Simulated Steam API for local testing (loaded only with PP_MOCK_STEAM in dev).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

const GAMES = [
  { appid: 504230, name: 'Celeste', n: 32, done: 32, hours: 41, color: [90, 60, 170] },
  { appid: 1145360, name: 'Hades', n: 49, done: 46, hours: 88, color: [170, 50, 40] },
  { appid: 367520, name: 'Hollow Knight', n: 63, done: 21, hours: 35, color: [40, 70, 110] },
  { appid: 620, name: 'Portal 2', n: 51, done: 51, hours: 22, color: [60, 120, 160] },
  { appid: 413150, name: 'Stardew Valley', n: 40, done: 28, hours: 140, color: [70, 140, 60] },
  { appid: 40800, name: 'Super Meat Boy', n: 46, done: 12, hours: 15, color: [160, 30, 30] },
  { appid: 588650, name: 'Dead Cells', n: 54, done: 51, hours: 60, color: [30, 90, 90] },
  { appid: 1, name: 'Some Tool', n: 0, done: 0, hours: 3, color: [80, 80, 80] }
];

function rnd(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }

function achFor(g) {
  const r = rnd(g.appid);
  const list = [];
  for (let i = 0; i < g.n; i++) {
    const pct = i === g.n - 1 ? 0.4 + r() * 2 : Math.max(0.5, 90 - i * (85 / g.n) + r() * 6);
    const unlocked = i < g.done;
    list.push({
      apiname: `ACH_${i}`,
      name: `${g.name} logro ${i + 1}`,
      description: i % 7 === 3 ? '' : `Completa el desafío número ${i + 1}.`,
      hidden: i % 7 === 3 ? 1 : 0,
      pct: Math.round(pct * 10) / 10,
      achieved: unlocked ? 1 : 0,
      unlocktime: unlocked ? NOW - Math.floor(r() * 360 * DAY) - (i === 0 ? 0 : DAY) : 0
    });
  }
  return list;
}
const ACH = Object.fromEntries(GAMES.map(g => [g.appid, achFor(g)]));
// Something unlocked today/yesterday for the streak
if (ACH[1145360]) { ACH[1145360][0].unlocktime = NOW - 3600; ACH[1145360][1].unlocktime = NOW - DAY; }

// ---------- tiny PNG generator ----------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, [r, g, b], gray) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const f = 0.55 + 0.45 * ((x + y) / (w + h));
      const o = y * (w * 3 + 1) + 1 + x * 3;
      let rr = r * f, gg = g * f, bb = b * f;
      if (gray) { const m = (rr + gg + bb) / 3; rr = gg = bb = m * 0.6; }
      raw[o] = rr; raw[o + 1] = gg; raw[o + 2] = bb;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function colorFromUrl(url) {
  const m = String(url).match(/\/(\d+)\//);
  const g = m && GAMES.find(x => String(x.appid) === m[1]);
  return g ? g.color : [100, 100, 120];
}

function res(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, arrayBuffer: async () => body };
}

let calls = [];
async function mockFetch(url) {
  const u = new URL(url);
  const p = u.pathname;
  const q = Object.fromEntries(u.searchParams);
  calls.push(p);
  await new Promise(r => setTimeout(r, 20));
  if (p.includes('ResolveVanityURL')) return res(200, { response: q.vanityurl === 'muertemil' ? { success: 1, steamid: '76561198000000001' } : { success: 42 } });
  if (p.includes('GetPlayerSummaries')) {
    return res(200, { response: { players: [{ personaname: 'MuerteMil', gameid: process.env.PP_PLAYING || '1145360', gameextrainfo: 'Hades' }] } });
  }
  if (p.includes('GetOwnedGames')) {
    if (q.key !== 'A'.repeat(32)) return res(403, 'Forbidden');
    return res(200, { response: { game_count: GAMES.length, games: GAMES.map(g => ({ appid: g.appid, name: g.name, playtime_forever: g.hours * 60, img_icon_url: '', has_community_visible_stats: g.n > 0, rtime_last_played: NOW - (g.appid % 30) * DAY })) } });
  }
  if (p.includes('GetPlayerAchievements')) {
    const list = ACH[q.appid];
    if (!list || !list.length) return res(400, { playerstats: { error: 'Requested app has no stats', success: false } });
    return res(200, { playerstats: { success: true, achievements: list.map(a => ({ apiname: a.apiname, achieved: a.achieved, unlocktime: a.unlocktime })) } });
  }
  if (p.includes('GetSchemaForGame')) {
    const list = ACH[q.appid] || [];
    const sp = q.l === 'spanish';
    return res(200, { game: { availableGameStats: { achievements: list.map(a => ({
      name: a.apiname, displayName: sp ? a.name : a.name.replace('logro', 'achievement'), description: a.hidden ? '' : (sp ? a.description : `Complete challenge ${a.apiname}.`), hidden: a.hidden,
      icon: `https://steamcdn-a.akamaihd.net/icons/${q.appid}/${a.apiname}.jpg`, icongray: `https://steamcdn-a.akamaihd.net/icons/${q.appid}/${a.apiname}_g.jpg`
    })) } } });
  }
  if (p.includes('GetGlobalAchievementPercentagesForApp')) {
    const list = ACH[q.gameid] || [];
    return res(200, { achievementpercentages: { achievements: list.map(a => ({ name: a.apiname, percent: String(a.pct) })) } });
  }
  if (p.includes('/api/appdetails')) {
    const id = Number(q.appids);
    const g = GAMES.find(x => x.appid === id) || { name: `Store game ${id}` };
    const genres = { 504230: ['Indie', 'Action', 'Platformer'], 1145360: ['Action', 'Indie', 'RPG'], 367520: ['Action', 'Adventure', 'Indie'], 413150: ['Simulation', 'RPG', 'Indie'] }[id] || ['Action', 'Indie'];
    const header = id === 367520 ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/0123456789abcdef0123456789abcdef01234567/header.jpg?t=1`
      : id === 40800 ? '' : `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;
    return res(200, { [id]: { success: true, data: { name: g.name, header_image: header, background_raw: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/page_bg_raw.jpg`, short_description: `${g.name} — descripción breve de prueba del juego para comprobar el editor.`, genres: genres.map(d => ({ description: d })) } } });
  }
  if (p.includes('/api/storesearch')) {
    return res(200, { items: [{ id: 268910, name: 'Cuphead', tiny_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/268910/capsule.jpg' }, { id: 504230, name: 'Celeste', tiny_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/capsule.jpg' }] });
  }
  if (u.hostname.includes('akamaihd') || u.hostname.includes('steamstatic')) {
    return res(200, png(64, 64, colorFromUrl(url), p.includes('_g.jpg')));
  }
  return res(404, null);
}

async function mockHltb(url, opts = {}) {
  const u = new URL(url);
  const text = (s, status = 200) => ({ ok: status === 200, status, text: async () => s, json: async () => JSON.parse(s) });
  if (u.pathname === '/') return text('<html><script src="/_next/static/chunks/pages/_app-123.js"></script></html>');
  if (u.pathname.startsWith('/_next/')) return text('x=1;fetch("/api/seek/7b1c", { method: "POST", headers: h, body: b })');
  if (u.pathname === '/api/seek/7b1c/init') return text(JSON.stringify({ token: 'tok', hpKey: 'abc', hpVal: 'xyz' }));
  if (u.pathname === '/api/seek/7b1c' && opts.method === 'POST') {
    const body = JSON.parse(opts.body);
    if (opts.headers['x-auth-token'] !== 'tok' || body.abc !== 'xyz') return text('{}', 403);
    const term = body.searchTerms.join(' ').toLowerCase();
    const g = GAMES.find(x => x.name.toLowerCase() === term);
    const data = g ? [{ game_id: g.appid % 9999, game_name: g.name, comp_100: Math.round(g.n * 1.7 * 3600), comp_main: 10 * 3600, profile_steam: g.appid }] : [];
    return text(JSON.stringify({ data }));
  }
  return text('', 404);
}

function install({ steam, app }) {
  steam._setFetch(mockFetch);
  const { protocol } = require('electron');
  protocol.handle('https', (req) => {
    const u = new URL(req.url);
    // Simulate Steam's broken classic URLs: Hollow Knight only works with the hashed path, Super Meat Boy has no image at all.
    if (/\/apps\/367520\/header\.jpg/.test(u.pathname) || /\/apps\/40800\//.test(u.pathname)) return new Response('not found', { status: 404 });
    const isHeader = /header|capsule/.test(u.pathname);
    const body = isHeader ? png(460, 215, colorFromUrl(req.url)) : png(64, 64, colorFromUrl(req.url), u.pathname.includes('_g.jpg'));
    return new Response(body, { headers: { 'content-type': 'image/png' } });
  });
  global.__ppMockCalls = calls;
  require('../src/main/hltb')._setFetch(mockHltb);
}

function afterWindow({ win, app }) {
  const script = process.env.PP_E2E_SCRIPT;
  if (script) require(path.resolve(script)).run({ win, app, calls });
}

module.exports = { install, afterWindow, GAMES };
