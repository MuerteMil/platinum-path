(function (PP) {
  'use strict';
  const { t, $, escapeHtml, safeUrl, fmtNum, fmtDate } = PP;

  let sortBy = 'recent';
  let seq = 0;

  function sorted(games) {
    const list = games.slice();
    if (sortBy === 'hours') list.sort((a, b) => (b.hours || 0) - (a.hours || 0));
    if (sortBy === 'days') list.sort((a, b) => (b.days || 0) - (a.days || 0));
    if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    return list; // 'recent' comes sorted from main
  }

  function card(g) {
    const icon = g.rarest ? safeUrl(g.rarest.icon) : '';
    return `<button type="button" class="trophy" data-open-game="${Number(g.appid)}">
      <div class="trophyCover">${PP.coverImg(g)}<span class="badge gold">💎 100%</span></div>
      <div class="trophyBody">
        <div class="trophyName">${escapeHtml(g.name)}</div>
        <div class="muted">${escapeHtml(fmtDate(g.completedAtSec ? g.completedAtSec * 1000 : null, false))}${g.days ? ` · ${escapeHtml(t('showcase.took', { d: fmtNum(g.days) }))}` : ''}</div>
        <div class="trophyNums">
          <div><b>${fmtNum(g.hours, 1)}</b><span>${escapeHtml(t('showcase.hours'))}</span></div>
          <div><b>${g.days != null ? fmtNum(g.days) : '—'}</b><span>${escapeHtml(t('showcase.days'))}</span></div>
          <div><b>${fmtNum(g.achTotal)}</b><span>${escapeHtml(t('showcase.achievements'))}</span></div>
        </div>
        ${g.rarest ? `<div class="trophyRare">${icon ? `<img src="${icon}" alt="" loading="lazy"/>` : ''}<div><div class="rn">${escapeHtml(g.rarest.name)}</div><div class="rp">${escapeHtml(t('showcase.rarest'))} · ${fmtNum(g.rarest.pct, 1)}%</div></div></div>` : ''}
      </div>
    </button>`;
  }

  async function render() {
    const box = $('showcaseView');
    const my = ++seq;
    const res = await window.api.showcase();
    if (my !== seq || PP.state.view !== 'showcase') return;
    const games = (res && res.games) || [];
    const hours = games.reduce((a, g) => a + (g.hours || 0), 0);
    const ach = games.reduce((a, g) => a + (g.achTotal || 0), 0);
    box.innerHTML = `
      <div class="showcaseHead">
        <div>
          <div class="showcaseSummary">${escapeHtml(t('showcase.summary'))}</div>
          <div class="muted">${escapeHtml(t('showcase.totals', { n: fmtNum(games.length), h: fmtNum(hours), a: fmtNum(ach) }))}</div>
        </div>
        <div class="row">
          <select id="showcaseSort">
            ${['recent', 'hours', 'days', 'name'].map(k => `<option value="${k}" ${k === sortBy ? 'selected' : ''}>${escapeHtml(t(`showcase.sort.${k}`))}</option>`).join('')}
          </select>
          <button class="btn primary" type="button" id="showcaseExport" ${games.length ? '' : 'disabled'}>📷 ${escapeHtml(t('showcase.export'))}</button>
        </div>
      </div>
      ${games.length ? `<div class="trophyGrid">${sorted(games).map(card).join('')}</div>` : `<div class="empty"><p>${escapeHtml(t('showcase.empty'))}</p></div>`}`;
  }

  function bind() {
    $('showcaseView').addEventListener('click', async (e) => {
      const g = e.target.closest('[data-open-game]');
      if (g) { PP.openEditor(Number(g.dataset.openGame)); return; }
      if (e.target.closest('#showcaseExport')) {
        const btn = $('showcaseExport');
        btn.disabled = true;
        PP.toast(t('showcase.exporting'), 'info', 2500);
        const res = await window.api.exportShowcase({
          locale: PP.locale(), title: t('showcase.title'),
          summary: `${t('showcase.summary')} · ${$('showcaseView').querySelector('.showcaseHead .muted').textContent}`,
          hours: t('showcase.hours'), days: t('showcase.days'), achievements: t('showcase.achievements'), rarest: t('showcase.rarest')
        });
        btn.disabled = false;
        if (res && res.ok) PP.toast(t('showcase.exported', { path: res.filePath }), 'ok', 6000);
        else if (res && !res.canceled) PP.toast(t('sync.err.unexpected'), 'error');
      }
    });
    $('showcaseView').addEventListener('change', (e) => {
      if (e.target.id === 'showcaseSort') { sortBy = e.target.value; render(); }
    });
  }

  Object.assign(PP, { renderShowcase: render, bindShowcase: bind });
})(window.PP);
