'use strict';
// "Vitrina de platinos": data for completed games and PNG export.

const fs = require('fs');
const data = require('./data');
const { htmlToPng, COVER_FALLBACK_JS } = require('./render');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function effectiveHours(g) {
  const mh = Number(g.manualHours);
  return mh > 0 ? mh : (Number(g.hours) || 0);
}

function fileToDataUri(p) {
  try {
    const buf = fs.readFileSync(p);
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    return `data:image/${isPng ? 'png' : 'jpeg'};base64,${buf.toString('base64')}`;
  } catch { return ''; }
}

/** Completed games with their numbers, newest first. */
function collect() {
  const out = [];
  for (const g of Object.values(data.getGames())) {
    const total = Number(g.achTotal) || 0;
    if (!(total > 0 && Number(g.achUnlocked) >= total)) continue;
    const list = Object.values((data.getAchGame(g.appid) || {}).list || {}).filter(a => a.existsInCurrentSteamData !== false);
    const times = list.filter(a => a.unlocked && a.unlockTimeSec).map(a => a.unlockTimeSec);
    const first = times.length ? Math.min(...times) : null;
    const last = times.length ? Math.max(...times) : null;
    let rarest = null;
    for (const a of list) {
      if (a.globalPct == null) continue;
      if (!rarest || a.globalPct < rarest.globalPct) rarest = a;
    }
    out.push({
      appid: g.appid,
      name: g.name || `App ${g.appid}`,
      coverUrl: g.coverUrl || '',
      completedAtSec: Number(g.completedAtSec) || last || null,
      firstUnlockSec: first,
      days: first && last ? Math.max(1, Math.ceil((last - first) / 86400)) : null,
      hours: Math.round(effectiveHours(g) * 10) / 10,
      achTotal: total,
      rating: g.rating ?? null,
      rarest: rarest ? {
        name: rarest.displayName, pct: rarest.globalPct,
        icon: require('./steam').normalizeIconUrl(rarest.iconUrl), localIcon: rarest.localIconPath || ''
      } : null
    });
  }
  out.sort((a, b) => (b.completedAtSec || 0) - (a.completedAtSec || 0));
  return out;
}

function buildHtml({ games, texts, accent }) {
  const locale = texts.locale || 'es-ES';
  const date = (sec) => (sec ? new Date(sec * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const num = (n, d = 0) => Number(n || 0).toLocaleString(locale, { maximumFractionDigits: d, minimumFractionDigits: d });
  const cols = Math.min(4, Math.max(2, games.length));
  const width = 72 + cols * 290 + (cols - 1) * 16;
  const totalHours = games.reduce((a, g) => a + (g.hours || 0), 0);
  const totalAch = games.reduce((a, g) => a + (g.achTotal || 0), 0);
  const cards = games.map(g => {
    const icon = g.rarest ? (g.rarest.localIcon ? fileToDataUri(g.rarest.localIcon) : g.rarest.icon) : '';
    return `<div class="card">
      <div class="cover"><img src="${esc(g.coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`)}" data-appid="${Number(g.appid)}" data-name="${esc(g.name)}"/><span class="badge">💎 100%</span></div>
      <div class="body">
        <div class="name">${esc(g.name)}</div>
        <div class="date">${esc(date(g.completedAtSec))}</div>
        <div class="nums">
          <div><b>${num(g.hours, 1)}</b><span>${esc(texts.hours || 'h')}</span></div>
          <div><b>${g.days != null ? num(g.days) : '—'}</b><span>${esc(texts.days || 'days')}</span></div>
          <div><b>${num(g.achTotal)}</b><span>${esc(texts.achievements || 'ach.')}</span></div>
        </div>
        ${g.rarest ? `<div class="rare">${icon ? `<img src="${esc(icon)}"/>` : ''}<div><div class="rn">${esc(g.rarest.name)}</div><div class="rp">${esc(texts.rarest || 'Rarest')} · ${num(g.rarest.pct, 1)}%</div></div></div>` : ''}
      </div></div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;background:#0e1116;color:#e3e3e8;font-family:"Segoe UI",system-ui,Arial,sans-serif;width:${width}px}
    .wrap{padding:36px;background:radial-gradient(900px 500px at 20% 0%, ${esc(accent)}33, transparent 60%)}
    h1{margin:0;font-size:30px} .sub{color:#9aa4b2;margin-top:6px;font-size:15px}
    .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;margin-top:26px}
    .card{background:#151b24;border:1px solid rgba(255,205,60,.45);border-radius:16px;overflow:hidden}
    .cover{position:relative;aspect-ratio:460/215;background:#222} .cover img{width:100%;height:100%;object-fit:cover;display:block}
    .cover.noimg{background:linear-gradient(135deg,${esc(accent)}55,#151b24)} .cover.noimg::after{content:attr(data-name);position:absolute;inset:0;display:grid;place-items:center;padding:12px;text-align:center;font-weight:800;font-size:16px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6)}
    .badge{position:absolute;left:8px;bottom:8px;background:rgba(14,17,22,.85);color:#ffcd3c;border:1px solid rgba(255,205,60,.6);border-radius:999px;font-size:11px;font-weight:700;padding:3px 8px}
    .body{padding:12px} .name{font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .date{color:#9aa4b2;font-size:12px;margin-top:2px}
    .nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px} .nums div{background:#0e1116;border-radius:10px;padding:6px 8px}
    .nums b{display:block;font-size:15px} .nums span{color:#9aa4b2;font-size:10px;text-transform:uppercase}
    .rare{display:flex;gap:8px;align-items:center;margin-top:10px} .rare img{width:34px;height:34px;border-radius:6px}
    .rn{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px} .rp{font-size:11px;color:#ffe7a3}
    .foot{margin-top:24px;color:#9aa4b2;font-size:12px;display:flex;justify-content:space-between}
  </style></head><body><div class="wrap">
    <h1>💎 ${esc(texts.title || 'Platinum showcase')}${texts.steamName ? ` · ${esc(texts.steamName)}` : ''}</h1>
    <div class="sub">${esc(texts.summary || `${num(games.length)} · ${num(totalHours)} h · ${num(totalAch)}`)}</div>
    <div class="grid">${cards}</div>
    <div class="foot"><span>Platinum Path</span><span>${esc(new Date().toLocaleDateString(locale))}</span></div>
  </div><script>${COVER_FALLBACK_JS}</script></body></html>`;
}

async function renderImage({ texts, accent, steamName }) {
  const games = collect();
  const name = steamName || (data.getProfile() || {}).personaName || '';
  const html = buildHtml({ games, texts: { ...texts, steamName: name }, accent: /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : '#C832A0' });
  const cols = Math.min(4, Math.max(2, games.length));
  const width = 72 + cols * 290 + (cols - 1) * 16;
  const rows = Math.max(1, Math.ceil(games.length / cols));
  return htmlToPng(html, { width, height: 200 + rows * 330 });
}

module.exports = { collect, renderImage, _buildHtml: buildHtml };
