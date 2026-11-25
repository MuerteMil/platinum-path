(function (PP) {
  'use strict';
  // Right click on a game (card or list row): quick menu to change its status.
  const { t, $, escapeHtml } = PP;
  const STATUSES = ['', 'in_progress', 'possible_100', 'paused'];
  const ICON = { '': '○', in_progress: '▶', possible_100: '🎯', paused: '⏸' };

  let menu = null;
  let currentId = null;
  let returnFocus = null;

  function ensureMenu() {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'statusMenu';
    menu.className = 'menu ctxMenu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.appendChild(menu);
    menu.addEventListener('click', onPick);
    menu.addEventListener('keydown', onKey);
    return menu;
  }

  function itemsHTML(g) {
    const cur = g.status || '';
    return `<div class="ctxTitle">${escapeHtml(g.name || '')}</div>` +
      `<div class="ctxSection">${escapeHtml(t('edit.status'))}</div>` +
      STATUSES.map(s => `
        <button type="button" role="menuitemradio" aria-checked="${s === cur}" data-status="${s}" class="${s === cur ? 'on' : ''}">
          <span class="ctxIcon">${ICON[s]}</span><span>${escapeHtml(t(`statusOne.${s || 'none'}`))}</span><span class="ctxCheck">${s === cur ? '✓' : ''}</span>
        </button>`).join('') +
      `<div class="ctxSep"></div>` +
      `<button type="button" role="menuitem" data-open><span class="ctxIcon">↗</span><span>${escapeHtml(t('statusMenu.open'))}</span><span class="ctxCheck"></span></button>`;
  }

  function open(appid, x, y, from) {
    const g = PP.gameById(appid);
    if (!g) return;
    ensureMenu();
    currentId = Number(appid);
    returnFocus = from || null;
    menu.innerHTML = itemsHTML(g);
    menu.hidden = false;
    // Keep it inside the window.
    const r = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    const first = menu.querySelector('button.on') || menu.querySelector('button');
    if (first) first.focus();
  }

  function close() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    currentId = null;
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  }

  async function onPick(e) {
    const btn = e.target.closest('button');
    if (!btn || currentId == null) return;
    const id = currentId;
    if ('open' in btn.dataset) { close(); PP.openEditor(id); return; }
    const status = btn.dataset.status;
    close();
    const g = PP.gameById(id);
    if (!g || (g.status || '') === status) return;
    const res = await window.api.updateGame({ appid: id, status });
    if (!res || !res.ok || !res.game) { PP.toast(PP.errorText(res && res.error), 'error'); return; }
    const idx = PP.state.library.findIndex(x => Number(x.appid) === id);
    if (idx >= 0) PP.state.library[idx] = { ...PP.state.library[idx], ...res.game };
    PP.render();
    PP.toast(t('statusMenu.done', { name: res.game.name || '', status: t(`statusOne.${status || 'none'}`) }), 'ok', 2200);
  }

  function onKey(e) {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); close(); }
  }

  /** Right click (or the keyboard's menu key / Shift+F10) on a card or list row. */
  function onContext(e) {
    const el = e.target.closest('.card[data-appid], tr[data-appid]');
    if (!el) return;
    e.preventDefault();
    let { clientX: x, clientY: y } = e;
    if (!x && !y) { const r = el.getBoundingClientRect(); x = r.left + 24; y = r.top + 24; } // from the keyboard
    open(Number(el.dataset.appid), x, y, el);
  }

  function bind() {
    $('grid').addEventListener('contextmenu', onContext);
    $('listView').addEventListener('contextmenu', onContext);
    document.addEventListener('mousedown', (e) => { if (menu && !menu.hidden && !menu.contains(e.target)) close(); }, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
  }

  PP.statusMenu = { open, close };
  PP.bindStatusMenu = bind;
})(window.PP);
