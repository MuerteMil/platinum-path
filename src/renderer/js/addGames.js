(function (PP) {
  'use strict';
  const { t, $, escapeHtml, safeUrl } = PP;

  let owned = [];          // from Steam
  let selected = new Set();
  let loaded = false;

  function visibleOwned() {
    const term = $('ownedSearch').value.trim().toLowerCase();
    const onlyStats = $('ownedOnlyStats').checked;
    const hideAdded = $('ownedHideAdded').checked;
    const showIgnored = $('ownedShowIgnored').checked;
    return owned
      .filter(g => showIgnored || !g.ignored)
      .filter(g => !term || g.name.toLowerCase().includes(term))
      .filter(g => !onlyStats || g.hasStats)
      .filter(g => !hideAdded || !g.inLibrary)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }

  function renderOwned() {
    const list = visibleOwned();
    const box = $('ownedList');
    box.innerHTML = list.map(g => {
      const checked = selected.has(g.appid);
      return `
        <label class="ownedCard ${g.inLibrary ? 'inLib' : ''} ${g.ignored ? 'ignored' : ''} ${checked ? 'checked' : ''}" data-appid="${g.appid}">
          <div class="ownedCover">${PP.coverImg({ appid: g.appid, name: g.name, coverUrl: g.coverUrl })}
            ${!g.inLibrary ? `<button type="button" class="ignoreBtn" data-ignore="${g.appid}" title="${escapeHtml(g.ignored ? t('add.unignore') : t('add.ignore'))}">${g.ignored ? '↺' : '🚫'}</button>` : ''}
          </div>
          <div class="ownedMeta">
            <span class="ownedName">${escapeHtml(g.name)}</span>
            ${g.inLibrary
              ? `<span class="tag">${escapeHtml(t('add.inLibrary'))}</span>`
              : g.ignored ? `<span class="tag">${escapeHtml(t('add.ignored'))}</span>`
              : `<input type="checkbox" data-appid="${g.appid}" ${checked ? 'checked' : ''}/>`}
          </div>
          <div class="ownedSub muted">${PP.fmtNum(g.playtimeMinutes / 60, 1)} h</div>
        </label>`;
    }).join('');
    $('addFootInfo').textContent = t('add.countInfo', { shown: list.length, total: owned.length });
    updateCount();
  }

  function updateCount() {
    $('selectedCount').textContent = t('add.selected', { n: selected.size });
    $('addCheckedBtn').disabled = selected.size === 0;
    const selectable = visibleOwned().filter(g => !g.inLibrary && !g.ignored);
    const all = $('selectAllOwned');
    const nSel = selectable.filter(g => selected.has(g.appid)).length;
    all.checked = selectable.length > 0 && nSel === selectable.length;
    all.indeterminate = nSel > 0 && nSel < selectable.length;
  }

  async function loadOwned() {
    $('ownedList').innerHTML = `<div class="muted pad">${escapeHtml(t('add.loading'))}</div>`;
    const res = await window.api.ownedGames();
    if (!res || !res.ok) {
      $('ownedList').innerHTML = `<div class="muted pad">${escapeHtml(t('add.loadError', { reason: PP.errorText(res && res.error) }))}</div>`;
      loaded = false;
      return;
    }
    owned = res.games || [];
    loaded = true;
    renderOwned();
  }

  function switchTab(tab) {
    document.querySelectorAll('[data-addtab]').forEach(b => b.classList.toggle('primary', b.dataset.addtab === tab));
    document.querySelectorAll('[data-addpane]').forEach(p => { p.hidden = p.dataset.addpane !== tab; });
    $('addCheckedBtn').hidden = tab !== 'owned';
    $('addFootInfo').hidden = tab !== 'owned';
    if (tab === 'store') $('storeTerm').focus();
  }

  async function open() {
    selected = new Set();
    $('ownedSearch').value = '';
    $('storeTerm').value = '';
    $('storeResults').innerHTML = '';
    switchTab('owned');
    $('addModal').showModal();
    // Mark games that are already in the library without reloading from Steam.
    if (loaded) {
      const inLib = new Set(PP.state.library.map(g => Number(g.appid)));
      owned.forEach(g => { g.inLibrary = inLib.has(g.appid); });
      renderOwned();
    } else {
      await loadOwned();
    }
    $('ownedSearch').focus();
  }

  async function addAppids(appids, hint) {
    const res = await window.api.addGames(appids, hint);
    if (!res || !res.ok) { PP.toast(PP.errorText(res && res.error), 'error'); return null; }
    await PP.refreshLibrary();
    PP.render();
    return res;
  }

  async function addChecked() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const hint = owned.filter(g => selected.has(g.appid)).map(g => ({ appid: g.appid, name: g.name, playtimeMinutes: g.playtimeMinutes }));
    $('addCheckedBtn').disabled = true;
    const res = await addAppids(ids, hint);
    if (res) {
      let msg = t('add.added', { n: res.added });
      if (res.skipped) msg += ` · ${t('add.skipped', { n: res.skipped })}`;
      PP.toast(msg, 'ok');
      owned.forEach(g => { if (selected.has(g.appid)) g.inLibrary = true; });
      selected = new Set();
      $('addModal').close();
    }
    $('addCheckedBtn').disabled = false;
  }

  async function storeSearch() {
    const raw = $('storeTerm').value.trim();
    const box = $('storeResults');
    if (!raw) { box.innerHTML = ''; return; }
    if (/^\d+$/.test(raw)) {
      const id = Number(raw);
      const inLib = !!PP.gameById(id);
      box.innerHTML = `<div class="storeAppid"><span class="muted">${escapeHtml(t('add.appidDetected', { id }))}</span>
        ${inLib ? `<span class="tag">${escapeHtml(t('add.inLibrary'))}</span>` : `<button class="btn primary" type="button" data-store-add="${id}">${escapeHtml(t('add.addAppid', { id }))}</button>`}</div>`;
      return;
    }
    box.innerHTML = `<div class="muted pad">${escapeHtml(t('add.searching'))}</div>`;
    const res = await window.api.searchStore(raw);
    if (!res || !res.ok) { box.innerHTML = `<div class="muted pad">${escapeHtml(t('add.storeError'))}</div>`; return; }
    if (!res.items.length) { box.innerHTML = `<div class="muted pad">${escapeHtml(t('add.noResults'))}</div>`; return; }
    box.innerHTML = res.items.map(it => `
      <button type="button" class="storeCard ${it.inLibrary ? 'inLib' : ''}" ${it.inLibrary ? 'disabled' : `data-store-add="${it.appid}"`} data-name="${escapeHtml(it.name)}">
        <img class="storeCover" src="${safeUrl(it.coverUrl)}" alt="" loading="lazy"/>
        <span class="storeName">${escapeHtml(it.name)}</span>
        ${it.inLibrary ? `<span class="tag">${escapeHtml(t('add.inLibrary'))}</span>` : ''}
      </button>`).join('');
  }

  function bind() {
    $('addGamesBtn').addEventListener('click', open);
    $('reloadOwnedBtn').addEventListener('click', loadOwned);
    $('ownedSearch').addEventListener('input', PP.debounce(renderOwned, 120));
    $('ownedOnlyStats').addEventListener('change', renderOwned);
    $('ownedHideAdded').addEventListener('change', renderOwned);
    $('ownedShowIgnored').addEventListener('change', renderOwned);
    $('ownedList').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ignore]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const id = Number(b.dataset.ignore);
      const g = owned.find(x => x.appid === id);
      if (!g) return;
      g.ignored = !g.ignored;
      selected.delete(id);
      await window.api.setIgnored(id, g.ignored);
      renderOwned();
    });
    $('addCheckedBtn').addEventListener('click', addChecked);
    document.querySelectorAll('[data-addtab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.addtab)));

    $('ownedList').addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"][data-appid]');
      if (!cb) return;
      const id = Number(cb.dataset.appid);
      if (cb.checked) selected.add(id); else selected.delete(id);
      cb.closest('.ownedCard').classList.toggle('checked', cb.checked);
      updateCount();
    });
    $('selectAllOwned').addEventListener('change', () => {
      const on = $('selectAllOwned').checked;
      for (const g of visibleOwned()) {
        if (g.inLibrary || g.ignored) continue;
        if (on) selected.add(g.appid); else selected.delete(g.appid);
      }
      renderOwned();
    });

    $('storeSearchBtn').addEventListener('click', storeSearch);
    $('storeTerm').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); storeSearch(); } });
    $('storeResults').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-store-add]');
      if (!b) return;
      const id = Number(b.dataset.storeAdd);
      const name = b.dataset.name || `AppID ${id}`;
      b.disabled = true;
      const res = await addAppids([id], b.dataset.name ? [{ appid: id, name: b.dataset.name }] : []);
      if (res) { PP.toast(t('add.oneAdded', { name }), 'ok'); $('addModal').close(); }
      else b.disabled = false;
    });
  }

  Object.assign(PP, { openAddGames: open, bindAddGames: bind });
})(window.PP);
