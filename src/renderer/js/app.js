(function (PP) {
  'use strict';
  const { t, $, escapeHtml } = PP;
  const DEFAULT_DIR = { name: 'asc', priority: 'asc', pct: 'desc', remaining: 'asc', hours: 'desc', hltb: 'asc', diff: 'asc', rating: 'desc', played: 'desc', added: 'desc' };

  function updateStickyOffset() {
    const h = $('appHeader').offsetHeight || 0;
    document.documentElement.style.setProperty('--header-h', `${h}px`);
  }

  // ---------- now playing ----------
  function renderNowPlaying() {
    const box = $('nowPlaying');
    const np = PP.state.nowPlaying;
    if (!np || !np.appid) { box.hidden = true; box.innerHTML = ''; updateStickyOffset(); return; }
    const g = PP.gameById(np.appid);
    let info = '';
    if (g) {
      const left = PP.logic.remaining(g);
      info = Number(g.achTotal) > 0
        ? (PP.logic.isDone(g) ? '💎 100%' : escapeHtml(t('now.pending', { n: left })))
        : '';
      const miss = Number(g.missableLeft) || 0;
      if (miss) info += ` · ⚠ ${escapeHtml(t('now.missable', { n: miss }))}`;
    }
    box.innerHTML = `<span class="npDot"></span><b>${escapeHtml(t('now.playing'))}:</b> <span class="npName">${escapeHtml((g && g.name) || np.name)}</span>
      ${g ? `<span class="muted">${info}</span><button class="btn small primary" type="button" data-np="open">${escapeHtml(t('now.open'))}</button>`
          : `<span class="muted">${escapeHtml(t('now.notInLib'))}</span><button class="btn small" type="button" data-np="add">${escapeHtml(t('now.add'))}</button>`}`;
    box.hidden = false;
    updateStickyOffset();
  }

  function setView(view) {
    PP.state.view = view;
    PP.render();
    window.scrollTo({ top: 0 });
  }

  // ---------- sync ----------
  function setSyncing(on) {
    PP.state.syncing = on;
    $('syncBtn').disabled = on;
    $('syncLabel').textContent = on ? t('sync.running') : t('sync.button');
    $('syncProgress').hidden = !on;
    if (!on) $('syncProgressBar').style.width = '0%';
    updateStickyOffset();
  }

  async function runSync(force = true) {
    if (PP.state.syncing) return;
    setSyncing(true);
    await window.api.syncNow({ force });
    // UI is updated by the 'sync:done' event.
  }

  let manualSync = false;
  function bindSyncEvents() {
    window.api.on('sync:start', () => setSyncing(true));
    window.api.on('sync:progress', ({ done, total, name }) => {
      setSyncing(true);
      $('syncProgressBar').style.width = `${total ? (done / total) * 100 : 0}%`;
      $('syncProgressText').textContent = t('sync.progress', { done: done + 1, total, name });
    });
    window.api.on('sync:done', async (res) => {
      setSyncing(false);
      await PP.refreshLibrary();
      PP.render();
      if (!res) return;
      if (!res.ok) {
        // Background syncs fail silently unless credentials are the problem.
        if (manualSync || ['auth', 'private', 'missing_credentials'].includes(res.error)) PP.toast(PP.errorText(res.error), 'error', 8000);
      } else if (manualSync) {
        PP.toast(res.synced ? t('sync.done', { n: res.synced }) : t('sync.doneNone'), 'ok', 2500);
      }
      if (res.newlyUnlocked) PP.toast(t('sync.newUnlocks', { n: res.newlyUnlocked }), 'ok');
      if (res.completed && res.completed.length) PP.celebrate(res.completed);
      manualSync = false;
      renderNowPlaying();
    });
    window.api.on('celebrate', (c) => PP.celebrate([c]));
    window.api.on('nowPlaying', (np) => { PP.state.nowPlaying = np; renderNowPlaying(); });
    window.api.on('hltb:progress', ({ done, total }) => {
      if (done === total) PP.toast(t('hltb.progress', { done, total }), 'ok', 2500);
    });
    window.api.on('library:changed', PP.debounce(async () => {
      await PP.refreshLibrary();
      if (!$('editModal').open) PP.render(); else PP.renderLater = true;
      renderNowPlaying();
    }, 600));
  }

  // ---------- update banner ----------
  function showUpdateBanner(st) {
    const b = $('banner');
    if (!st || !['available', 'downloading', 'ready'].includes(st.state)) { b.hidden = true; updateStickyOffset(); return; }
    let html = '';
    if (st.state === 'available') {
      html = `<span>✨ ${escapeHtml(t('update.bannerAvailable', { v: st.version }))}</span>
        ${st.canInstall ? `<button class="btn small primary" type="button" data-upd="download">${escapeHtml(t('update.download'))}</button>` : ''}
        <button class="btn small" type="button" data-upd="open" data-url="${escapeHtml(st.url || '')}">${escapeHtml(t('update.open'))}</button>`;
    } else if (st.state === 'downloading') {
      html = `<span>${escapeHtml(t('update.downloading', { p: st.percent || 0 }))}</span>`;
    } else if (st.state === 'ready') {
      html = `<span>✅ ${escapeHtml(t('update.ready', { v: st.version }))}</span>
        <button class="btn small primary" type="button" data-upd="install">${escapeHtml(t('update.install'))}</button>`;
    }
    b.innerHTML = html;
    b.hidden = false;
    updateStickyOffset();
  }

  // ---------- header ----------
  function bindHeader() {
    $('q').addEventListener('input', PP.debounce(() => { PP.state.term = $('q').value; PP.render(); }, 120));
    $('sort').addEventListener('change', () => {
      const key = $('sort').value;
      PP.state.sort = `${key}-${DEFAULT_DIR[key] || 'asc'}`;
      PP.savePrefs();
      PP.render();
    });
    $('sortDirBtn').addEventListener('click', () => {
      const [key, dir] = PP.state.sort.split('-');
      PP.state.sort = `${key}-${dir === 'asc' ? 'desc' : 'asc'}`;
      PP.savePrefs();
      PP.render();
    });
    $('sidebar').addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]');
      if (m) { PP.state.mode = m.dataset.mode; PP.state.collection = null; PP.savePrefs(); setView('library'); return; }
      const c = e.target.closest('[data-collection]');
      if (c) { PP.state.collection = c.dataset.collection; PP.savePrefs(); setView('library'); return; }
      const v = e.target.closest('[data-view]');
      if (v) setView(v.dataset.view);
    });
    document.querySelectorAll('[data-viewmode]').forEach(b => b.addEventListener('click', () => {
      PP.state.viewMode = b.dataset.viewmode;
      PP.savePrefs();
      PP.render();
    }));
    $('nowPlaying').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-np]');
      const np = PP.state.nowPlaying;
      if (!b || !np) return;
      if (b.dataset.np === 'open') PP.openEditor(np.appid);
      if (b.dataset.np === 'add') {
        const res = await window.api.addGames([np.appid], [{ appid: np.appid, name: np.name }]);
        if (res && res.ok) { PP.toast(t('add.oneAdded', { name: np.name }), 'ok'); await PP.refreshLibrary(); PP.render(); renderNowPlaying(); }
      }
    });
    $('hltbAllBtn').addEventListener('click', async () => {
      const res = await window.api.hltbAll();
      if (res && res.total != null) PP.toast(t('hltb.allStarted', { n: res.total }), 'info', 4000);
    });
    $('yearSelect').addEventListener('change', () => { PP.state.year = Number($('yearSelect').value); PP.render(); });
    $('syncBtn').addEventListener('click', () => { manualSync = true; runSync(true); });

    // "More" menu
    const menu = $('moreMenu');
    const toggle = (show) => { menu.hidden = !show; $('moreBtn').setAttribute('aria-expanded', show ? 'true' : 'false'); };
    $('moreBtn').addEventListener('click', (e) => { e.stopPropagation(); toggle(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.menuWrap')) toggle(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
    menu.addEventListener('click', () => toggle(false));

    $('exportBtn').addEventListener('click', async () => {
      const res = await window.api.exportBackup();
      if (res && res.ok) PP.toast(t('backup.exported', { path: res.filePath }), 'ok', 6000);
    });
    $('importBtn').addEventListener('click', async () => {
      const res = await window.api.importBackup({
        confirm: t('backup.confirm'), detail: t('backup.confirmDetail'), ok: t('backup.ok'), cancel: t('common.cancel')
      });
      if (res && res.ok) {
        await loadSettings();
        await PP.refreshLibrary();
        PP.render();
        PP.toast(t('backup.imported', { n: res.games }), 'ok', 6000);
      } else if (res && !res.canceled) {
        PP.toast(t('backup.invalid'), 'error');
      }
    });
    $('dataFolderBtn').addEventListener('click', () => window.api.openDataFolder());

    $('banner').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-upd]');
      if (!b) return;
      if (b.dataset.upd === 'open') window.api.openExternal(b.dataset.url);
      if (b.dataset.upd === 'download') window.api.downloadUpdate();
      if (b.dataset.upd === 'install') window.api.installUpdate();
    });

    // Keyboard: Ctrl+F focuses search
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('q').focus(); $('q').select(); }
    });
  }

  async function loadSettings() {
    const res = await window.api.getSettings();
    PP.state.settings = (res && res.settings) || {};
    PP.setLang(PP.state.settings.language || 'spanish');
    PP.applyI18n();
    PP.applyTheme(PP.state.settings.themeAccent);
  }

  async function init() {
    await loadSettings();
    PP.loadPrefs();
    PP.bindCards();
    PP.bindFilters();
    PP.bindEditor();
    PP.bindAddGames();
    PP.bindSettings();
    PP.bindStats();
    PP.bindList();
    PP.bindShowcase();
    PP.bindRecap();
    PP.bindWizard();
    bindHeader();
    bindSyncEvents();
    $('editModal').addEventListener('close', () => { if (PP.renderLater) { PP.renderLater = false; PP.render(); } });

    await PP.refreshLibrary();
    setSyncing(PP.state.syncing);
    PP.render();
    updateStickyOffset();
    window.addEventListener('resize', PP.debounce(updateStickyOffset, 100));
    new ResizeObserver(() => requestAnimationFrame(updateStickyOffset)).observe($('appHeader'));

    // Keep "last sync: x min ago" fresh.
    setInterval(() => { if (PP.state.view === 'library' && !document.querySelector('dialog[open]')) PP.render(); }, 60000);

    const np = await window.api.nowPlaying();
    PP.state.nowPlaying = np && np.current;
    renderNowPlaying();

    const info = await window.api.appInfo();
    if (info && info.update) showUpdateBanner(info.update);

    // First run: guide the user to settings.
    if (!PP.state.settings.hasApiKey || !PP.state.settings.steamId) PP.openWizard();
  }

  Object.assign(PP, { runSync, showUpdateBanner });
  document.addEventListener('DOMContentLoaded', init);
})(window.PP);
