(function (PP) {
  'use strict';
  const { t, $, escapeHtml, fmtNum, safeUrl } = PP;
  const L = PP.logic;

  function barChart(items, { labelOf, valueOf, height = 160, keyOf = null, selected = null }) {
    const max = Math.max(1, ...items.map(valueOf));
    const n = items.length;
    const pad = 22, gap = 8;
    const bw = Math.min(52, (720 - gap * (n - 1)) / n);
    const w = Math.max(160, n * bw + (n - 1) * gap);
    const bars = items.map((it, i) => {
      const v = valueOf(it);
      const h = Math.round((v / max) * (height - pad * 2));
      const x = i * (bw + gap);
      const y = height - pad - h;
      const key = keyOf ? keyOf(it) : null;
      const tip = it.games ? `${labelOf(it)} ${it.year}: ${it.games.map(g => g.name).join(', ') || 0}` : `${labelOf(it)}: ${v}`;
      return `<g ${key ? `class="barGroup ${key === selected ? 'sel' : ''}" data-key="${escapeHtml(key)}"` : ''}><title>${escapeHtml(tip)}</title>
        ${key ? `<rect x="${(x - gap / 2).toFixed(1)}" y="0" width="${(bw + gap).toFixed(1)}" height="${height}" class="barHit"/>` : ''}
        <rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${Math.max(h, v ? 2 : 0)}" rx="4" class="barRect"/>
        ${!v ? `<rect x="${x.toFixed(1)}" y="${height - pad - 2}" width="${bw.toFixed(1)}" height="2" rx="1" class="barZero"/>` : ''}
        ${v ? `<text x="${(x + bw / 2).toFixed(1)}" y="${y - 5}" class="barVal">${v}</text>` : ''}
        <text x="${(x + bw / 2).toFixed(1)}" y="${height - 6}" class="barLabel">${escapeHtml(labelOf(it))}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${height}" width="${w}" height="${height}" class="chart" role="img">${bars}</svg>`;
  }

  function heatmap(days, maxDay) {
    const size = 11, gap = 3;
    const weeks = Math.ceil((days[0].weekday + days.length) / 7);
    const w = weeks * (size + gap) + 20, h = 7 * (size + gap) + 4;
    const level = (c) => (c === 0 ? 0 : Math.min(4, Math.ceil((c / Math.max(1, maxDay)) * 4)));
    let col = 0;
    const cells = days.map((d, i) => {
      if (i > 0 && d.weekday === 0) col++;
      const x = 20 + col * (size + gap), y = d.weekday * (size + gap);
      const [yy, mm, dd] = d.key.split('-').map(Number);
      const label = new Date(yy, mm - 1, dd).toLocaleDateString(PP.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
      return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="2" class="hm l${level(d.count)}"><title>${escapeHtml(t('stats.dayTip', { d: label, n: d.count }))}</title></rect>`;
    }).join('');
    const wd = t('weekdays').split(',');
    const labels = [0, 2, 4].map(i => `<text x="0" y="${i * (size + gap) + size - 1}" class="hmLabel">${escapeHtml(wd[i])}</text>`).join('');
    const legend = `<div class="hmLegend muted">${escapeHtml(t('stats.less'))} ${[0, 1, 2, 3, 4].map(l => `<i class="hm l${l}"></i>`).join('')} ${escapeHtml(t('stats.more'))}</div>`;
    return `<div class="hmWrap"><svg viewBox="0 0 ${w} ${h}" class="heatmap">${labels}${cells}</svg></div>${legend}`;
  }

  let loadSeq = 0;
  async function open() {
    const body = $('statsBody');
    const seq = ++loadSeq;
    if (!body.innerHTML) body.innerHTML = `<div class="muted pad">${escapeHtml(t('common.loading'))}</div>`;
    const res = await window.api.stats();
    if (seq !== loadSeq || PP.state.view !== 'stats') return;
    const unlocks = (res && res.unlocks) || [];
    const lib = PP.state.library;
    if (!unlocks.length && !lib.some(L.isDone)) {
      body.innerHTML = `<div class="muted pad">${escapeHtml(t('stats.none'))}</div>`;
      return;
    }
    const s = L.buildStats(unlocks, lib, new Date());
    // Select the most recent month with completions by default.
    const withGames = s.monthsDone.filter(m => m.games.length);
    const sel = selectedMonth && s.monthsDone.some(m => m.key === selectedMonth) ? selectedMonth : (withGames.length ? withGames[withGames.length - 1].key : null);
    current = s;
    const monthNames = t('months').split(',');
    const year = new Date().getFullYear();
    const goal = Number(PP.state.settings.yearlyGoal) || 0;
    const doneYear = L.completedInYear(lib, year);

    body.innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${fmtNum(s.total)}</b><span>${escapeHtml(t('stats.totalUnlocked'))}</span></div>
        <div class="kpi"><b>${fmtNum(s.thisYear)}</b><span>${escapeHtml(t('stats.thisYear'))}</span></div>
        <div class="kpi"><b>${lib.filter(L.isDone).length}</b><span>${escapeHtml(t('stats.completed'))}</span></div>
        <div class="kpi"><b>${s.streak.current}</b><span>${escapeHtml(t('stats.streak'))}</span></div>
        <div class="kpi"><b>${s.streak.longest}</b><span>${escapeHtml(t('stats.longest'))}</span></div>
      </div>
      ${goal > 0 ? `<div class="goalBox"><div>${escapeHtml(t('stats.goal', { year, done: doneYear, goal }))}</div><div class="bigBar"><i style="width:${Math.min(100, doneYear / goal * 100).toFixed(0)}%"></i></div></div>` : ''}
      <section class="statSection"><h3>${escapeHtml(t('stats.heatmap'))}</h3>${heatmap(s.days, s.maxDay)}</section>
      <section class="statSection"><h3>${escapeHtml(t('stats.donePerMonth'))}</h3>
        ${barChart(s.monthsDone, { labelOf: m => monthNames[m.month], valueOf: m => m.games.length, keyOf: m => m.key, selected: sel })}
        <div class="muted hint">${escapeHtml(t('stats.clickMonth'))}</div>
        <div id="monthGames" class="monthGames"></div></section>
      ${s.years.length ? `<section class="statSection"><h3>${escapeHtml(t('stats.perYear'))}</h3>
        ${barChart(s.years, { labelOf: y => String(y.year), valueOf: y => y.count, height: 140 })}</section>` : ''}
      ${s.rarest.length ? `<section class="statSection"><h3>${escapeHtml(t('stats.rarest'))}</h3>
        <div class="rareList">${s.rarest.map(r => `
          <div class="rareItem">
            ${r.icon ? `<img src="${safeUrl(r.icon)}" alt="" loading="lazy"/>` : ''}
            <div><b>${escapeHtml(r.name)}</b><div class="muted">${escapeHtml(r.game)}</div></div>
            <span class="achBadge r-ultra">${fmtNum(r.pct, 1)}%</span>
          </div>`).join('')}</div></section>` : ''}
    `;
    renderMonth(sel);
  }

  let current = null;

  function renderMonth(key) {
    const box = $('monthGames');
    if (!box || !current) return;
    box.closest('.statSection').querySelectorAll('.barGroup').forEach(g => g.classList.toggle('sel', g.dataset.key === key));
    const m = current.monthsDone.find(x => x.key === key);
    if (!m) { box.innerHTML = `<div class="muted">${escapeHtml(t('stats.noneMonth'))}</div>`; return; }
    const monthNames = t('months').split(',');
    const title = `${monthNames[m.month]} ${m.year}`;
    if (!m.games.length) { box.innerHTML = `<div class="muted"><b>${escapeHtml(title)}</b> · ${escapeHtml(t('stats.noneMonth'))}</div>`; return; }
    box.innerHTML = `<div class="monthTitle"><b>${escapeHtml(title)}</b> · ${escapeHtml(t('stats.gamesDone', { n: m.games.length }))}</div>
      <div class="doneList">${m.games.map(g => `
        <button type="button" class="doneItem" data-open-game="${Number(g.appid)}">
          <img src="${safeUrl(g.coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`)}" alt="" loading="lazy"/>
          <span><b>${escapeHtml(g.name)}</b><span class="muted">💎 ${escapeHtml(PP.fmtDate(g.completedAtSec * 1000, false))}</span></span>
        </button>`).join('')}</div>`;
  }

  let selectedMonth = null;
  function bind() {
    $('statsBody').addEventListener('click', (e) => {
      const bar = e.target.closest('.barGroup[data-key]');
      if (bar) { selectedMonth = bar.dataset.key; renderMonth(selectedMonth); return; }
      const g = e.target.closest('[data-open-game]');
      if (g) PP.openEditor(Number(g.dataset.openGame));
    });
  }

  Object.assign(PP, { bindStats: bind, renderStats: open, barChart });
})(window.PP);
