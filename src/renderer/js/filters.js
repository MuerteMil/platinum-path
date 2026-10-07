(function (PP) {
  'use strict';
  const { t, $, escapeHtml } = PP;
  const L = PP.logic;

  function numOrNull(el) {
    const raw = String(el.value || '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function fillUI() {
    const f = PP.state.filters;
    $('filterMinScore').value = f.minRating ?? '';
    $('filterMaxScore').value = f.maxRating ?? '';
    $('filterOnlyRated').checked = !!f.onlyRated;
    $('filterOnlyNotes').checked = !!f.onlyNotes;
    $('filterHideNoAch').checked = !!f.hideNoAch;
    $('filterMinHours').value = f.minHours ?? '';
    $('filterMaxHours').value = f.maxHours ?? '';
    document.querySelectorAll('#filterModal [data-diff]').forEach(cb => { cb.checked = (f.diffRanges || []).includes(cb.dataset.diff); });
    document.querySelectorAll('#filterModal [data-prog]').forEach(cb => { cb.checked = (f.progRanges || []).includes(cb.dataset.prog); });
    const genres = L.allGenres(PP.state.library);
    const sel = $('filterGenre');
    sel.innerHTML = `<option value="">${escapeHtml(t('filters.any'))}</option>` +
      genres.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    sel.value = genres.includes(f.genre) ? f.genre : '';
    const cols = L.allCollections(PP.state.library);
    const cs = $('filterCollection');
    cs.innerHTML = `<option value="">${escapeHtml(t('filters.any'))}</option>` +
      cols.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    cs.value = cols.includes(f.collection) ? f.collection : '';
  }

  function readUI() {
    return {
      minRating: numOrNull($('filterMinScore')),
      maxRating: numOrNull($('filterMaxScore')),
      onlyRated: $('filterOnlyRated').checked,
      onlyNotes: $('filterOnlyNotes').checked,
      hideNoAch: $('filterHideNoAch').checked,
      minHours: numOrNull($('filterMinHours')),
      maxHours: numOrNull($('filterMaxHours')),
      diffRanges: Array.from(document.querySelectorAll('#filterModal [data-diff]')).filter(c => c.checked).map(c => c.dataset.diff),
      progRanges: Array.from(document.querySelectorAll('#filterModal [data-prog]')).filter(c => c.checked).map(c => c.dataset.prog),
      genre: $('filterGenre').value || null,
      collection: $('filterCollection').value || null
    };
  }

  function open() { fillUI(); $('filterModal').showModal(); }

  function bind() {
    $('filterBtn').addEventListener('click', open);
    $('applyFiltersBtn').addEventListener('click', () => {
      PP.state.filters = readUI();
      PP.savePrefs();
      $('filterModal').close();
      PP.render();
    });
    $('clearFiltersBtn').addEventListener('click', () => {
      PP.state.filters = L.emptyFilters();
      PP.savePrefs();
      fillUI();
      PP.render();
    });
  }

  Object.assign(PP, { bindFilters: bind });
})(window.PP);
