'use strict';
// Shareable recap image (month or year). The numbers are computed in the renderer
// (logic.buildRecap) and sent here; every value is escaped before it goes into the page.

const { htmlToPng, COVER_FALLBACK_JS } = require('./render');

const WIDTH = 1080;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const httpsUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const coverOf = (g) => httpsUrl(g.coverUrl) || `https://cdn.cloudflare.steamstatic.com/steam/apps/${num(g.appid)}/header.jpg`;

function chartSvg(values, labels, accent) {
  const w = WIDTH - 72 - 32, h = 160, pad = 22;
  const n = values.length || 1;
  const gap = n > 20 ? 3 : 8;
  const bw = (w - gap * (n - 1)) / n;
  const max = Math.max(1, ...values);
  const bars = values.map((v, i) => {
    const bh = Math.round((v / max) * (h - pad * 2));
    const x = i * (bw + gap);
    const label = labels[i] != null ? `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 4}" class="lab">${esc(labels[i])}</text>` : '';
    const value = v && n <= 12 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${h - pad - bh - 5}" class="val">${v}</text>` : '';
    return `<rect x="${x.toFixed(1)}" y="${h - pad - Math.max(bh, v ? 2 : 1)}" width="${bw.toFixed(1)}" height="${Math.max(bh, v ? 2 : 1)}" rx="3" fill="${v ? esc(accent) : 'rgba(255,255,255,.1)'}"/>${value}${label}`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${bars}</svg>`;
}

function buildHtml({ recap: r, texts: t, accent, steamName }) {
  const locale = t.locale || 'es-ES';
  const fmt = (n, d = 0) => num(n).toLocaleString(locale, { maximumFractionDigits: d, minimumFractionDigits: d });
  const date = (sec) => (sec ? new Date(sec * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '');
  const perUnit = Array.isArray(r.perUnit) ? r.perUnit.map(num) : [];
  const months = String(t.monthsShort || '').split(',');
  const labels = r.isYear ? perUnit.map((_, i) => months[i] || '') : perUnit.map((_, i) => ((i + 1) % 5 === 0 || i === 0 ? String(i + 1) : null));
  const completed = (r.completed || []).slice(0, 8);
  const more = Math.max(0, (r.completed || []).length - completed.length);
  const top = (r.topGames || []).slice(0, 5);
  const topMax = Math.max(1, ...top.map(g => num(g.count)));
  const rarest = (r.rarest || []).slice(0, 3);

  const kpi = (v, label, gold) => `<div class="kpi${gold ? ' gold' : ''}"><b>${v}</b><span>${esc(label)}</span></div>`;
  const delta = r.prevTotal > 0 ? Math.round(((r.total - r.prevTotal) / r.prevTotal) * 100) : null;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;background:#0e1116;color:#e3e3e8;font-family:"Segoe UI",system-ui,Arial,sans-serif;width:${WIDTH}px}
    .wrap{padding:36px;background:radial-gradient(900px 520px at 15% 0%, ${esc(accent)}38, transparent 60%),radial-gradient(700px 420px at 95% 10%, rgba(255,205,60,.08), transparent 60%)}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}
    .eyebrow{color:#9aa4b2;font-size:15px} h1{margin:4px 0 0;font-size:40px;line-height:1.1}
    .brand{color:#9aa4b2;font-size:14px;text-align:right} .brand b{color:#e3e3e8;display:block;font-size:16px}
    .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:26px}
    .kpi{background:rgba(20,26,34,.85);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:14px 16px}
    .kpi b{display:block;font-size:34px;line-height:1.1} .kpi span{color:#9aa4b2;font-size:13px}
    .kpi.gold{border-color:rgba(255,205,60,.5)} .kpi.gold b{color:#ffcd3c}
    .delta{margin-top:10px;color:#9aa4b2;font-size:13px}
    h2{font-size:15px;color:#9aa4b2;font-weight:600;margin:26px 0 10px}
    .chart{background:rgba(20,26,34,.6);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px 0 6px;display:flex;justify-content:center}
    .lab{fill:#9aa4b2;font-size:11px;text-anchor:middle} .val{fill:#e3e3e8;font-size:12px;font-weight:700;text-anchor:middle}
    .done{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .dcard{background:#151b24;border:1px solid rgba(255,205,60,.5);border-radius:14px;overflow:hidden}
    .cover{position:relative;aspect-ratio:460/215;background:#222} .cover img{width:100%;height:100%;object-fit:cover;display:block}
    .cover.noimg{background:linear-gradient(135deg,${esc(accent)}55,#151b24)} .cover.noimg::after{content:attr(data-name);position:absolute;inset:0;display:grid;place-items:center;padding:10px;text-align:center;font-weight:800;font-size:14px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6)}
    .dbody{padding:8px 10px} .dname{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .ddate{color:#ffe7a3;font-size:12px}
    .more{color:#9aa4b2;font-size:13px;margin-top:8px}
    .cols{display:grid;grid-template-columns:1.25fr 1fr;gap:20px}
    .tg{display:flex;gap:10px;align-items:center;margin-bottom:8px} .tg .cover{width:104px;flex:none;border-radius:8px;overflow:hidden}
    .tgm{flex:1;min-width:0} .tgn{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bar{height:7px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:5px} .bar i{display:block;height:100%;background:${esc(accent)}}
    .tgc{font-size:12px;color:#9aa4b2;margin-top:3px}
    .rare{display:flex;gap:10px;align-items:center;background:rgba(20,26,34,.85);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:8px;margin-bottom:8px}
    .rare img{width:42px;height:42px;border-radius:8px} .rm{flex:1;min-width:0} .rn{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .rg{color:#9aa4b2;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rp{color:#ffe7a3;border:1px solid rgba(255,205,60,.6);border-radius:999px;font-size:12px;padding:2px 8px;white-space:nowrap}
    .empty{color:#9aa4b2;font-size:13px}
    .foot{margin-top:26px;color:#9aa4b2;font-size:12px;display:flex;justify-content:space-between}
  </style></head><body><div class="wrap">
    <div class="top">
      <div><div class="eyebrow">${esc(t.heading || '')}${steamName ? ` · ${esc(steamName)}` : ''}</div><h1>${esc(t.period || '')}</h1></div>
      <div class="brand"><b>💎 Platinum Path</b>${esc(t.tagline || '')}</div>
    </div>
    <div class="kpis">
      ${kpi(fmt(r.total), t.unlocked)}
      ${kpi(fmt((r.completed || []).length), t.completed, true)}
      ${kpi(fmt(r.games), t.games)}
      ${kpi(fmt(r.activeDays), t.activeDays)}
      ${kpi(fmt(r.streak), t.streak)}
    </div>
    ${delta != null ? `<div class="delta">${esc(String(t.delta || '').replace('{d}', `${delta > 0 ? '+' : ''}${delta}`))}</div>` : ''}
    <h2>${esc(r.isYear ? t.chartYear : t.chartMonth)}</h2>
    <div class="chart">${chartSvg(perUnit, labels, accent)}</div>
    ${completed.length ? `<h2>💎 ${esc(t.completedTitle)}</h2><div class="done">${completed.map(g => `
      <div class="dcard"><div class="cover"><img src="${esc(coverOf(g))}" data-appid="${num(g.appid)}" data-name="${esc(g.name)}"/></div>
      <div class="dbody"><div class="dname">${esc(g.name)}</div><div class="ddate">${esc(date(g.completedAtSec))}</div></div></div>`).join('')}</div>
      ${more ? `<div class="more">${esc(String(t.andMore || '').replace('{n}', more))}</div>` : ''}` : ''}
    <div class="cols">
      <div><h2>${esc(t.topTitle)}</h2>${top.length ? top.map(g => `
        <div class="tg"><div class="cover"><img src="${esc(coverOf(g))}" data-appid="${num(g.appid)}" data-name="${esc(g.name)}"/></div>
        <div class="tgm"><div class="tgn">${esc(g.name)}</div><div class="bar"><i style="width:${Math.round((num(g.count) / topMax) * 100)}%"></i></div>
        <div class="tgc">${esc(String(t.topCount || '{n}').replace('{n}', fmt(g.count)))}${g.pct != null ? ` · ${fmt(g.pct)}%` : ''}</div></div></div>`).join('') : `<div class="empty">—</div>`}</div>
      <div><h2>${esc(t.rarestTitle)}</h2>${rarest.length ? rarest.map(a => `
        <div class="rare">${httpsUrl(a.icon) ? `<img src="${esc(httpsUrl(a.icon))}"/>` : ''}<div class="rm"><div class="rn">${esc(a.name)}</div><div class="rg">${esc(a.game)}</div></div><span class="rp">${fmt(a.pct, 1)}%</span></div>`).join('') : `<div class="empty">—</div>`}</div>
    </div>
    <div class="foot"><span>Platinum Path</span><span>${esc(new Date().toLocaleDateString(locale))}</span></div>
  </div><script>${COVER_FALLBACK_JS}</script></body></html>`;
}

async function renderImage({ recap, texts, accent, steamName }) {
  const color = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : '#C832A0';
  return htmlToPng(buildHtml({ recap, texts, accent: color, steamName }), { width: WIDTH, height: 1400 });
}

module.exports = { renderImage, _buildHtml: buildHtml };
