(function (PP) {
  'use strict';
  // Recap: what you achieved in a month or a year, with a shareable image.
  const { t, $, escapeHtml, safeUrl, fmtNum, fmtDate } = PP;
  const L = PP.logic;

  let scope = 'month';      // month | year
  let periodKey = null;     // "2026-9" (month is 0-based) or "2026"
  let seq = 0;
  let lastRecap = null;

  function monthName(m) { return t('monthsLong').split(',')[m] || ''; }
  function periodTitle(r) { return r.isYear ? String(r.year) : `${monthName(r.month)} ${r.year}`; }

  function pickDefault(periods) {
    const now = new Date();
    if (scope === 'year') {
      const keys = periods.years.map(String);
      if (periodKey && keys.includes(periodKey)) return periodKey;
      return keys[0] || String(now.getFullYear());
    }
    const keys = periods.months.map(m => `${m.year}-${m.month}`);
    if (periodKey && keys.includes(periodKey)) return periodKey;
    return keys[0] || `${now.getFullYear()}-${now.getMonth()}`;
  }

  function options(periods) {
    if (scope === 'year') {
      const years = periods.years.length ? periods.years : [new Date().getFullYear()];
      return years.map(y => `<option value="${y}" ${String(y) === periodKey ? 'selected' : ''}>${y}</option>`).join('');
    }
    const months = periods.months.length ? periods.months : [{ year: new Date().getFullYear(), month: new Date().getMonth() }];
    return months.map(m => { const k = `${m.year}-${m.month}`; return `<option value="${k}" ${k === periodKey ? 'selected' : ''}>${escapeHtml(`${monthName(m.month)} ${m.year}`)}</option>`; }).join('');
  }

  function deltaText(r) {
    if (!(r.prevTotal > 0)) return '';
    const d = Math.round(((r.total - r.prevTotal) / r.prevTotal) * 100);
    return t(r.isYear ? 'recap.deltaYear' : 'recap.deltaMonth', { d: `${d > 0 ? '+' : ''}${d}` });
  }

  function chart(r) {
    const months = t('months').split(',');
    const items = r.perUnit.map((v, i) => ({ v, label: r.isYear ? months[i] : ((i + 1) % 5 === 0 || i === 0 ? String(i + 1) : '') }));
    return PP.barChart(items, { labelOf: it => it.label, valueOf: it => it.v, height: 150 });
  }

  function body(r) {
    if (!r.total && !r.completed.length) {
      return `<div class="empty"><p>${escapeHtml(t('recap.empty'))}</p></div>`;
    }
    const kpi = (v, label) => `<div class="kpi"><b>${v}</b><span>${escapeHtml(label)}</span></div>`;
    const best = r.isYear
      ? (r.bestMonth ? t('recap.bestMonth', { m: monthName(r.bestMonth.month), n: r.bestMonth.count }) : '')
      : (r.bestDay ? t('recap.bestDay', { d: (() => { const [y, m, d] = r.bestDay.key.split('-').map(Number); return fmtDate(new Date(y, m - 1, d).getTime(), false); })(), n: r.bestDay.count }) : '');
    return `
      <div class="kpis">
        ${kpi(fmtNum(r.total), t('recap.unlocked'))}
        ${kpi(fmtNum(r.completed.length), t('recap.completed'))}
        ${kpi(fmtNum(r.games), t('recap.games'))}
        ${kpi(fmtNum(r.activeDays), t('recap.activeDays'))}
        ${kpi(fmtNum(r.streak), t('recap.streak'))}
      </div>
      <section class="statSection"><h3>${escapeHtml(r.isYear ? t('recap.chartYear') : t('recap.chartMonth'))}</h3>${chart(r)}
        ${best ? `<div class="muted hint">${escapeHtml(best)}</div>` : ''}</section>
      ${r.completed.length ? `<section class="statSection"><h3>💎 ${escapeHtml(t('recap.completedTitle'))}</h3>
        <div class="doneList">${r.completed.map(g => `
          <button type="button" class="doneItem" data-open-game="${Number(g.appid)}">
            <img src="${safeUrl(g.coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`)}" alt="" loading="lazy"/>
            <span><b>${escapeHtml(g.name)}</b><span class="muted">💎 ${escapeHtml(fmtDate(g.completedAtSec * 1000, false))}</span></span>
          </button>`).join('')}</div></section>` : ''}
      <div class="recapCols">
        <section class="statSection"><h3>${escapeHtml(t('recap.topTitle'))}</h3>
          ${r.topGames.length ? `<div class="recapTop">${r.topGames.map(g => `
            <button type="button" class="recapTopItem" data-open-game="${Number(g.appid)}">
              <span class="recapTopCover">${PP.coverImg(g)}</span>
              <span class="recapTopMeta"><b>${escapeHtml(g.name)}</b>
                <span class="progress"><i style="width:${Math.round((g.count / r.topGames[0].count) * 100)}%"></i></span>
                <span class="muted">${escapeHtml(t('recap.topCount', { n: fmtNum(g.count) }))}${g.pct != null ? ` · ${fmtNum(g.pct, 0)}%` : ''}</span></span>
            </button>`).join('')}</div>` : `<div class="muted">—</div>`}
        </section>
        <section class="statSection"><h3>${escapeHtml(t('recap.rarestTitle'))}</h3>
          ${r.rarest.length ? `<div class="rareList oneCol">${r.rarest.map(a => `
            <div class="rareItem">
              ${a.icon ? `<img src="${safeUrl(a.icon)}" alt="" loading="lazy"/>` : ''}
              <div><b>${escapeHtml(a.name)}</b><div class="muted">${escapeHtml(a.game)}</div></div>
              <span class="achBadge r-ultra">${fmtNum(a.pct, 1)}%</span>
            </div>`).join('')}</div>` : `<div class="muted">—</div>`}
        </section>
      </div>`;
  }

  async function render() {
    const box = $('recapView');
    const my = ++seq;
    if (!box.innerHTML) box.innerHTML = `<div class="muted pad">${escapeHtml(t('common.loading'))}</div>`;
    const res = await window.api.stats();
    if (my !== seq || PP.state.view !== 'recap') return;
    const unlocks = (res && res.unlocks) || [];
    const lib = PP.state.library;
    const periods = L.recapPeriods(unlocks, lib);
    periodKey = pickDefault(periods);
    const [y, m] = periodKey.split('-').map(Number);
    const r = L.buildRecap(unlocks, lib, { year: y, month: scope === 'year' ? null : m });
    lastRecap = r;
    const sub = [t('recap.sub', { n: fmtNum(r.total), g: fmtNum(r.completed.length) }), deltaText(r)].filter(Boolean).join(' · ');
    box.innerHTML = `
      <div class="showcaseHead">
        <div>
          <div class="showcaseSummary">${escapeHtml(periodTitle(r))}</div>
          <div class="muted">${escapeHtml(sub)}</div>
        </div>
        <div class="row">
          <div class="seg">
            <button class="btn ${scope === 'month' ? 'primary' : ''}" type="button" data-recap-scope="month">${escapeHtml(t('recap.month'))}</button>
            <button class="btn ${scope === 'year' ? 'primary' : ''}" type="button" data-recap-scope="year">${escapeHtml(t('recap.year'))}</button>
          </div>
          <select id="recapPeriod">${options(periods)}</select>
          <button class="btn primary" type="button" id="recapExport" ${r.total || r.completed.length ? '' : 'disabled'}>📷 ${escapeHtml(t('showcase.export'))}</button>
        </div>
      </div>
      ${body(r)}`;
  }

  async function exportImage() {
    const r = lastRecap;
    if (!r) return;
    const btn = $('recapExport');
    btn.disabled = true;
    PP.toast(t('showcase.exporting'), 'info', 2500);
    const res = await window.api.exportRecap({
      recap: r,
      texts: {
        locale: PP.locale(),
        heading: t(r.isYear ? 'recap.headingYear' : 'recap.headingMonth'),
        period: periodTitle(r),
        tagline: t('recap.tagline'),
        fileTag: r.isYear ? `resumen-${r.year}` : `resumen-${r.year}-${String(r.month + 1).padStart(2, '0')}`,
        unlocked: t('recap.unlocked'), completed: t('recap.completed'), games: t('recap.games'),
        activeDays: t('recap.activeDays'), streak: t('recap.streak'),
        delta: t(r.isYear ? 'recap.deltaYear' : 'recap.deltaMonth', { d: '{d}' }),
        chartMonth: t('recap.chartMonth'), chartYear: t('recap.chartYear'), monthsShort: t('months'),
        completedTitle: t('recap.completedTitle'), andMore: t('recap.andMore', { n: '{n}' }),
        topTitle: t('recap.topTitle'), topCount: t('recap.topCount', { n: '{n}' }), rarestTitle: t('recap.rarestTitle')
      }
    });
    btn.disabled = false;
    if (res && res.ok) PP.toast(t('showcase.exported', { path: res.filePath }), 'ok', 6000);
    else if (res && !res.canceled) PP.toast(t('sync.err.unexpected'), 'error');
  }

  function bind() {
    const box = $('recapView');
    box.addEventListener('click', (e) => {
      const g = e.target.closest('[data-open-game]');
      if (g) { PP.openEditor(Number(g.dataset.openGame)); return; }
      const sc = e.target.closest('[data-recap-scope]');
      if (sc && sc.dataset.recapScope !== scope) { scope = sc.dataset.recapScope; periodKey = null; render(); return; }
      if (e.target.closest('#recapExport')) exportImage();
    });
    box.addEventListener('change', (e) => {
      if (e.target.id === 'recapPeriod') { periodKey = e.target.value; render(); }
    });
  }

  Object.assign(PP, { renderRecap: render, bindRecap: bind });
})(window.PP);
