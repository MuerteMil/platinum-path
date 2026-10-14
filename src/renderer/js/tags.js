(function (PP) {
  'use strict';
  // Achievement tags: the built-in ones plus the user's own (stored in the main process).
  const { t, $, escapeHtml } = PP;

  // 'bugged' is just a label: it does not affect difficulty or progress.
  const BUILTIN = ['missable', 'online', 'coop', 'grind', 'hard', 'bugged'];
  const BUILTIN_ICON = { missable: '⚠', online: '🌐', coop: '👥', grind: '🔁', hard: '💀', bugged: '🐛' };
  const SUGGESTED_ICONS = ['📅', '⏰', '🎲', '🧩', '🗺️', '⭐', '🔒', '🎵', '🏁', '💬', '📖', '🎯'];

  let custom = [];   // [{ id, name, icon }]
  let usage = {};    // tag id -> number of achievements
  const listeners = [];

  async function load() {
    try {
      const res = await window.api.customTags();
      if (res && res.ok) { custom = res.tags || []; usage = res.usage || {}; }
    } catch {}
    return custom;
  }

  function changed() { listeners.forEach(fn => { try { fn(); } catch {} }); }
  function onChange(fn) { listeners.push(fn); }

  const isBuiltin = (id) => BUILTIN.includes(id);
  const customById = (id) => custom.find(c => c.id === id) || null;
  function all() { return [...BUILTIN, ...custom.map(c => c.id)]; }
  function exists(id) { return isBuiltin(id) || !!customById(id); }
  function label(id) { if (isBuiltin(id)) return t(`tag.${id}`); const c = customById(id); return c ? c.name : ''; }
  function icon(id) { if (isBuiltin(id)) return BUILTIN_ICON[id]; const c = customById(id); return c ? c.icon : '🏷️'; }
  function cls(id) { return isBuiltin(id) ? `tag-${id}` : 'tag-custom'; }

  function badgeHTML(id) {
    return `<span class="achBadge ${cls(id)}">${escapeHtml(icon(id))} ${escapeHtml(label(id))}</span>`;
  }
  function toggleHTML(id, on) {
    return `<button type="button" class="tagToggle ${on ? 'on' : ''} ${cls(id)}" data-tag="${escapeHtml(id)}">${escapeHtml(icon(id))} ${escapeHtml(label(id))}</button>`;
  }

  /** Rebuilds the "My tags" group of an achievement filter <select>. */
  function fillFilterSelect(select) {
    if (!select) return;
    const old = select.querySelector('optgroup[data-custom-tags]');
    if (old) old.remove();
    if (custom.length) {
      const group = document.createElement('optgroup');
      group.dataset.customTags = '1';
      group.label = t('tags.filterGroup');
      for (const c of custom) {
        const o = document.createElement('option');
        o.value = `tag:${c.id}`;
        o.textContent = `${c.icon} ${c.name}`;
        group.appendChild(o);
      }
      // Right after the built-in tag options.
      const anchor = select.querySelector('option[value="hidden"]');
      select.insertBefore(group, anchor || null);
    }
    if (![...select.options].some(o => o.value === select.value)) select.value = 'all';
  }

  function showError(res) {
    const code = res && res.error;
    const key = `err.${code}`;
    PP.toast(t(key) === key ? PP.errorText(code) : t(key), 'error');
  }

  async function create(name, iconValue) {
    const res = await window.api.createTag({ name, icon: iconValue });
    if (!res || !res.ok) { showError(res); return null; }
    await load();
    changed();
    if (!res.existed) PP.toast(t('tags.created', { name: res.tag.name }), 'ok', 2000);
    return res.tag;
  }

  // ---------- manage dialog ----------
  function renderManager() {
    $('tagsBuiltin').innerHTML = BUILTIN.map(id => badgeHTML(id)).join('');
    $('tagsList').innerHTML = custom.length
      ? custom.map(c => `
        <div class="tagRow" data-tag-id="${escapeHtml(c.id)}">
          <input type="text" class="tagIconInput" data-tag-field="icon" value="${escapeHtml(c.icon)}" maxlength="16" title="${escapeHtml(t('tags.iconTitle'))}" aria-label="Emoji"/>
          <input type="text" class="grow" data-tag-field="name" value="${escapeHtml(c.name)}" maxlength="24" aria-label="${escapeHtml(t('tags.namePh'))}"/>
          <span class="muted tagUses">${escapeHtml(t('tags.uses', { n: usage[c.id] || 0 }))}</span>
          <button type="button" class="iconbtn" data-tag-delete title="${escapeHtml(t('tags.delete'))}" aria-label="${escapeHtml(t('tags.delete'))}">🗑</button>
        </div>`).join('')
      : `<div class="muted">${escapeHtml(t('tags.empty'))}</div>`;
    $('tagSuggestions').innerHTML = SUGGESTED_ICONS.map(e => `<button type="button" class="emojiPick" data-emoji="${e}">${e}</button>`).join('');
  }

  async function openManager() {
    await load();
    renderManager();
    $('newTagName').value = '';
    $('newTagIcon').value = '';
    if (!$('tagsModal').open) $('tagsModal').showModal();
    $('newTagName').focus();
  }

  async function addFromManager() {
    const name = $('newTagName').value;
    if (!name.trim()) { showError({ error: 'tag_name_required' }); $('newTagName').focus(); return; }
    const tag = await create(name, $('newTagIcon').value);
    if (!tag) return;
    $('newTagName').value = '';
    $('newTagIcon').value = '';
    renderManager();
    $('newTagName').focus();
  }

  function bind() {
    $('manageTagsBtn').addEventListener('click', openManager);
    $('manageTagsFromSettings').addEventListener('click', openManager);
    $('addTagBtn').addEventListener('click', addFromManager);
    const modal = $('tagsModal');
    // Enter inside a text field would submit the dialog form: handle it here instead.
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      if (e.target.id === 'newTagName' || e.target.id === 'newTagIcon') addFromManager();
      else e.target.blur();
    });
    modal.addEventListener('click', async (e) => {
      const pick = e.target.closest('[data-emoji]');
      if (pick) { $('newTagIcon').value = pick.dataset.emoji; $('newTagName').focus(); return; }
      const del = e.target.closest('[data-tag-delete]');
      if (!del) return;
      const id = del.closest('[data-tag-id]').dataset.tagId;
      const c = customById(id);
      if (!c) return;
      const ok = await PP.confirmDialog(t('tags.deleteConfirm', { name: c.name, n: usage[id] || 0 }), t('common.delete'));
      if (!ok) return;
      const res = await window.api.deleteTag(id);
      if (!res || !res.ok) { showError(res); return; }
      await load();
      renderManager();
      changed();
    });
    modal.addEventListener('change', async (e) => {
      const field = e.target.dataset && e.target.dataset.tagField;
      if (!field) return;
      const id = e.target.closest('[data-tag-id]').dataset.tagId;
      const res = await window.api.updateTag(id, { [field]: e.target.value });
      if (!res || !res.ok) showError(res);
      await load();
      renderManager();
      changed();
    });
  }

  PP.tags = { BUILTIN, load, all, exists, label, icon, cls, badgeHTML, toggleHTML, fillFilterSelect, create, onChange, openManager, bind };
})(window.PP);
