(function (PP) {
  'use strict';
  const { t, $, escapeHtml, safeUrl, fmtNum, timeAgo } = PP;
  const L = PP.logic;

  function statusLabel(code) { return code ? t(`status.${code}`) : ''; }

  function diffText(g) {
    const d = L.effectiveDifficulty(g);
    if (d.value == null) return { html: '—', title: '' };
    return d.estimated
      ? { html: `~${d.value}<small>/10</small>`, title: t('card.estimated') }
      : { html: `${d.value}<small>/10</small>`, title: '' };
  }

  function cardHTML(g, draggable) {
    const done = L.isDone(g);
    const hasAch = Number(g.achTotal) > 0;
    const p = L.pct(g.achUnlocked, g.achTotal);
    const left = L.remaining(g);
    const almost = L.isAlmost(g);
    const diff = diffText(g);
    const name = g.name || `App ${g.appid}`;

    const badges = [];
    if (done) badges.push(`<span class="badge gold">💎 100%</span>`);
    if (g.newAchAlert) badges.push(`<span class="badge warn">⚠ ${escapeHtml(t('card.newAch'))}</span>`);
    if (!done && almost) badges.push(`<span class="badge almost">${escapeHtml(t('card.almost'))}</span>`);
    if (g.status) badges.push(`<span class="badge status-${escapeHtml(g.status)}">${escapeHtml(statusLabel(g.status))}</span>`);
    if (g.syncError) badges.push(`<span class="badge err" title="${escapeHtml(t('card.syncError'))}">!</span>`);

    const genres = [g.genrePrimary, g.genreSecondary].filter(Boolean).join(' · ');
    const progressText = hasAch
      ? `<b>${Number(g.achUnlocked) || 0}</b>/${Number(g.achTotal) || 0} · ${p.toFixed(0)}%${!done && left ? ` · ${escapeHtml(t('card.left', { n: left }))}` : ''}`
      : (g.noStats ? escapeHtml(t('card.noAch')) : '—');

    return `
      <article class="card ${done ? 'done' : ''} ${g.status ? 'st-' + escapeHtml(g.status) : ''} ${g.newAchAlert ? 'alerted' : ''}"
        data-appid="${Number(g.appid)}" tabindex="0" ${draggable ? 'draggable="true"' : ''} aria-label="${escapeHtml(name)}">
        <div class="cover">
          ${PP.coverImg(g)}
          <div class="coverBadges">${badges.join('')}</div>
          <div class="cardActions">
            <button type="button" class="cardBtn" data-act="play" title="${escapeHtml(t('card.play'))}">▶</button>
            <button type="button" class="cardBtn" data-act="edit" title="${escapeHtml(t('card.edit'))}">✎</button>
          </div>
          ${draggable ? '<span class="dragHandle" aria-hidden="true">⠿</span>' : ''}
        </div>
        <div class="body">
          <div class="title" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
          <div class="progress ${done ? 'full' : ''}" role="progressbar" aria-valuenow="${p.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${hasAch ? p.toFixed(1) : 0}%"></i></div>
          <div class="progressText muted">${progressText}</div>
          <div class="meta">
            <div class="pill"><span class="k">${escapeHtml(t('card.hours'))}</span><b>${fmtNum(L.effectiveHours(g), 1)}</b></div>
            <div class="pill" title="${escapeHtml(diff.title)}"><span class="k">${escapeHtml(t('card.difficulty'))}</span><b>${diff.html}</b></div>
            <div class="pill"><span class="k">${escapeHtml(t('card.rating'))}</span><b>${L.hasValue(g.rating) ? Number(g.rating) : '—'}</b></div>
          </div>
          ${hltbLine(g)}
          ${genres ? `<div class="genres muted">${escapeHtml(genres)}</div>` : ''}
          ${L.collectionsOf(g).length ? `<div class="chipsInline">${L.collectionsOf(g).map(c => `<span class="miniChip">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
          ${g.notes ? `<div class="notes muted">${escapeHtml(g.notes)}</div>` : ''}
        </div>
      </article>`;
  }

  function hltbLine(g) {
    const h = L.hltbHours(g);
    if (h == null || L.isDone(g)) return '';
    const left = L.hltbLeft(g);
    return `<div class="hltbLine muted">⏱ ${escapeHtml(t('hltb.label'))}: <b>~${fmtNum(h, 0)} h</b>${left != null ? ` · ${escapeHtml(left > 0 ? t('hltb.left', { h: fmtNum(left, 0) }) : t('hltb.over'))}` : ''}</div>`;
  }

  function renderStatsBar(list) {
    const s = L.summary(list);
    const st = PP.state;
    const year = new Date().getFullYear();
    const goal = Number(st.settings.yearlyGoal) || 0;
    const parts = [
      `<div class="stat"><b>${fmtNum(s.count)}</b> ${t('bar.games')}</div>`,
      `<div class="stat"><b>${fmtNum(s.hours, 1)}</b> ${t('bar.hours')}</div>`,
      `<div class="stat"><b>${fmtNum(s.unlockedAch)}</b>/<b>${fmtNum(s.totalAch)}</b> ${t('bar.achievements')}</div>`,
      `<div class="stat"><b>${fmtNum(s.p, 1)}%</b> ${t('bar.progress')}</div>`,
      `<div class="stat"><b>${s.completed}</b>/<b>${s.count}</b> ${t('bar.done')}</div>`
    ];
    if (goal > 0) {
      const done = L.completedInYear(st.library, year);
      const gp = Math.min(100, (done / goal) * 100);
      parts.push(`<div class="stat goal" title="${escapeHtml(t('stats.goal', { year, done, goal }))}">${escapeHtml(t('bar.goal', { year }))}: <b>${done}</b>/<b>${goal}</b><span class="miniBar"><i style="width:${gp.toFixed(0)}%"></i></span></div>`);
    }
    parts.push(`<div class="stat">${t('bar.lastSync')}: <b>${escapeHtml(timeAgo(st.lastSync))}</b></div>`);
    $('statsBar').innerHTML = parts.join('');
  }

  function viewTitle() {
    const st = PP.state;
    if (st.view === 'showcase') return t('showcase.title');
    if (st.view === 'stats') return t('stats.title');
    if (st.view === 'recap') return t('recap.title');
    if (st.collection) return st.collection;
    return { all: t('tab.all'), almost: t('tab.almost'), done: t('tab.done'), todo: t('tab.todo'), year: t('tab.year') }[st.mode] || t(`status.${st.mode}`);
  }

  function updateNav() {
    const st = PP.state;
    // Collections in the sidebar
    const cols = L.allCollections(st.library);
    if (st.collection && !cols.includes(st.collection)) st.collection = null;
    $('collectionNav').innerHTML = cols.length
      ? cols.map(c => `<button class="navItem" type="button" data-collection="${escapeHtml(c)}"><i>📁</i><span>${escapeHtml(c)}</span></button>`).join('')
      : `<div class="navEmpty muted">${escapeHtml(t('nav.noCollections'))}</div>`;
    document.querySelectorAll('#sidebar [data-mode]').forEach(b => b.classList.toggle('on', st.view === 'library' && !st.collection && b.dataset.mode === st.mode));
    document.querySelectorAll('#sidebar [data-collection]').forEach(b => b.classList.toggle('on', st.view === 'library' && b.dataset.collection === st.collection));
    document.querySelectorAll('#sidebar [data-view]').forEach(b => b.classList.toggle('on', st.view === b.dataset.view));
    $('viewTitle').textContent = viewTitle();
    // Tooltips for the collapsed (icon-only) sidebar
    document.querySelectorAll('#sidebar .navItem').forEach(b => { const s = b.querySelector('span'); if (s) b.title = s.textContent; });
    const lib = st.view === 'library';
    $('libraryControls').hidden = !lib;
    $('statsBar').hidden = !lib;
    $('libraryView').hidden = !lib;
    $('showcaseView').hidden = st.view !== 'showcase';
    $('statsView').hidden = st.view !== 'stats';
    $('recapView').hidden = st.view !== 'recap';
    document.querySelectorAll('[data-viewmode]').forEach(b => b.classList.toggle('primary', b.dataset.viewmode === st.viewMode));
    const ys = $('yearSelect');
    const years = Array.from(new Set(PP.state.library.filter(L.isDone).map(L.completedYear).filter(Boolean))).sort((a, b) => b - a);
    ys.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (!years.includes(Number(PP.state.year))) PP.state.year = years[0] || null;
    if (PP.state.year) ys.value = String(PP.state.year);
    ys.hidden = PP.state.view !== 'library' || PP.state.mode !== 'year' || !years.length || !!PP.state.collection;
  }

  function updateFilterBadge() {
    const n = L.activeFilterCount(PP.state.filters);
    const el = $('filterCount');
    el.hidden = n === 0;
    el.textContent = String(n);
  }

  function setHTML(el, html) {
    if (el._ppHtml === html) return;
    el._ppHtml = html;
    el.innerHTML = html;
  }

  function isPriorityMode() { return PP.state.sort === 'priority-asc'; }

  function render() {
    const st = PP.state;
    updateNav();
    updateFilterBadge();
    if (st.view === 'showcase') { PP.renderShowcase(); return; }
    if (st.view === 'stats') { PP.renderStats(); return; }
    if (st.view === 'recap') { PP.renderRecap(); return; }
    const [sortKey, sortDir] = st.sort.split('-');
    $('sort').value = sortKey;
    if ($('sort').value !== sortKey) { st.sort = 'name-asc'; $('sort').value = 'name'; }
    $('sortDirBtn').textContent = sortDir === 'desc' ? '↓' : '↑';
    const list = L.query(st.library, { term: st.term, mode: st.collection ? 'all' : st.mode, year: st.year, filters: st.filters, sort: st.sort, collection: st.collection });
    renderStatsBar(list);
    const isList = st.viewMode === 'list';
    const drag = isPriorityMode() && !isList;
    $('grid').hidden = isList;
    $('listView').hidden = !isList;
    // Only touch the DOM when something changed: periodic refreshes (every minute,
    // after each sync) would otherwise rebuild every card and reload every cover.
    if (isList) { PP.renderList(list); setHTML($('grid'), ''); }
    else { setHTML($('grid'), list.map(g => cardHTML(g, drag)).join('')); setHTML($('listView'), ''); }
    $('grid').classList.toggle('dragMode', drag);

    const empty = $('emptyState');
    if (!list.length) {
      let msg, btn = '';
      if (!st.settings.hasApiKey || !st.settings.steamId) { msg = t('empty.noSetup'); btn = `<button class="btn primary" type="button" data-empty="settings">${escapeHtml(t('empty.openSettings'))}</button>`; }
      else if (!st.library.length) { msg = t('empty.noGames'); btn = `<button class="btn primary" type="button" data-empty="add">${escapeHtml(t('add.button'))}</button>`; }
      else { msg = t('empty.noResults'); btn = `<button class="btn" type="button" data-empty="clear">${escapeHtml(t('empty.clearFilters'))}</button>`; }
      empty.innerHTML = `<p>${escapeHtml(msg)}</p>${btn}`;
      empty.hidden = false;
    } else {
      empty.hidden = true;
      if (drag) empty.hidden = true;
    }
    if (drag && list.length) PP.toastOnce('dragHint', t('card.dragHint'));
  }

  // ---------- events ----------
  function bind() {
    const grid = $('grid');
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      const appid = Number(card.dataset.appid);
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'play') { PP.openLink('play', appid); return; }
      PP.openEditor(appid);
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const card = e.target.closest('.card');
      if (card && e.target === card) PP.openEditor(Number(card.dataset.appid));
    });

    $('emptyState').addEventListener('click', (e) => {
      const b = e.target.closest('[data-empty]');
      if (!b) return;
      if (b.dataset.empty === 'settings') PP.openWizard();
      if (b.dataset.empty === 'add') PP.openAddGames();
      if (b.dataset.empty === 'clear') { PP.state.filters = L.emptyFilters(); PP.state.term = ''; $('q').value = ''; PP.state.mode = 'all'; PP.state.collection = null; PP.savePrefs(); render(); }
    });

    // Drag & drop priority ordering
    let dragId = null;
    grid.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.card');
      if (!card || !isPriorityMode()) return;
      dragId = Number(card.dataset.appid);
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragId));
    });
    grid.addEventListener('dragend', (e) => {
      const card = e.target.closest('.card');
      if (card) card.classList.remove('dragging');
      grid.querySelectorAll('.dropBefore,.dropAfter').forEach(el => el.classList.remove('dropBefore', 'dropAfter'));
      dragId = null;
    });
    grid.addEventListener('dragover', (e) => {
      if (dragId == null) return;
      const card = e.target.closest('.card');
      if (!card || Number(card.dataset.appid) === dragId) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      const after = (e.clientX - r.left) > r.width / 2;
      grid.querySelectorAll('.dropBefore,.dropAfter').forEach(el => el.classList.remove('dropBefore', 'dropAfter'));
      card.classList.add(after ? 'dropAfter' : 'dropBefore');
    });
    grid.addEventListener('drop', async (e) => {
      if (dragId == null) return;
      const card = e.target.closest('.card');
      if (!card) return;
      e.preventDefault();
      const targetId = Number(card.dataset.appid);
      const after = card.classList.contains('dropAfter');
      const order = L.query(PP.state.library, { sort: 'priority-asc' }).map(g => Number(g.appid)).filter(id => id !== dragId);
      let idx = order.indexOf(targetId);
      if (idx < 0) return;
      if (after) idx++;
      order.splice(idx, 0, dragId);
      order.forEach((id, i) => { const g = PP.gameById(id); if (g) g.priority = i + 1; });
      render();
      await window.api.reorderGames(order);
    });
  }

  const shownOnce = new Set();
  PP.toastOnce = (key, msg) => {
    if (shownOnce.has(key)) return;
    shownOnce.add(key);
    try { if (localStorage.getItem('pp.once.' + key)) return; localStorage.setItem('pp.once.' + key, '1'); } catch {}
    PP.toast(msg, 'info', 6000);
  };

  Object.assign(PP, { render, bindCards: bind, statusLabel, diffText, hltbLine, setHTML });
})(window.PP);
