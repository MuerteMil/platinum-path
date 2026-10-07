(function (PP) {
  'use strict';
  // Shared UI state. View preferences (tab, sort, filters) are remembered between sessions.
  const PREFS_KEY = 'pp.viewPrefs.v1';

  const state = {
    library: [],
    lastSync: 0,
    settings: {},
    syncing: false,
    mode: 'all',
    view: 'library',       // library | showcase | stats
    viewMode: 'grid',      // grid | list
    collection: null,
    nowPlaying: null,
    year: null,
    sort: 'name-asc',
    term: '',
    filters: PP.logic.emptyFilters()
  };

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (!p) return;
      if (typeof p.mode === 'string') state.mode = p.mode;
      if (typeof p.sort === 'string') state.sort = p.sort;
      if (p.viewMode === 'list' || p.viewMode === 'grid') state.viewMode = p.viewMode;
      if (typeof p.collection === 'string') state.collection = p.collection;
      if (p.filters && typeof p.filters === 'object') state.filters = { ...PP.logic.emptyFilters(), ...p.filters };
    } catch {}
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: state.mode, sort: state.sort, filters: state.filters, viewMode: state.viewMode, collection: state.collection })); } catch {}
  }

  async function refreshLibrary() {
    const res = await window.api.listLibrary();
    if (res && res.ok !== false) {
      state.library = res.games || [];
      state.lastSync = res.lastSync || 0;
      state.syncing = !!res.syncing;
    }
    return state.library;
  }

  function gameById(appid) { return state.library.find(g => Number(g.appid) === Number(appid)) || null; }

  PP.state = state;
  Object.assign(PP, { loadPrefs, savePrefs, refreshLibrary, gameById });
})(window.PP);
