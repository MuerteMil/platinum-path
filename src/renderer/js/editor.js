(function (PP) {
  'use strict';
  const { t, $, escapeHtml, safeUrl, fmtDate, fmtNum, timeAgo } = PP;
  const L = PP.logic;

  const TAGS = ['missable', 'online', 'coop', 'grind', 'hard'];
  const TAG_ICON = { missable: '⚠', online: '🌐', coop: '👥', grind: '🔁', hard: '💀' };

  let current = null;       // appid being edited
  let achievements = [];
  let collections = [];     // being edited in "My data"
  let openSeq = 0;
  let initialForm = '';     // snapshot of "My data" to detect unsaved changes

  const GENRES = {
    spanish: ['Plataformas', 'Plataformas de precisión', 'Metroidvania', 'Roguelike', 'Roguelite', 'Deckbuilder', 'RPG', 'Acción', 'Aventura', 'Puzzle', 'Estrategia', 'Soulslike', 'FPS', 'Simulación', 'Carreras', 'Ritmo', 'Terror', 'Indie', 'Casual'],
    english: ['Platformer', 'Precision platformer', 'Metroidvania', 'Roguelike', 'Roguelite', 'Deckbuilder', 'RPG', 'Action', 'Adventure', 'Puzzle', 'Strategy', 'Soulslike', 'FPS', 'Simulation', 'Racing', 'Rhythm', 'Horror', 'Indie', 'Casual']
  };

  function rarityClass(p) {
    if (p == null) return '';
    if (p < 5) return 'r-ultra';
    if (p < 15) return 'r-rare';
    if (p < 40) return 'r-uncommon';
    return 'r-common';
  }

  function tagsOf(a) {
    const set = new Set(Array.isArray(a.tags) ? a.tags : []);
    if (a.missable) set.add('missable');
    return TAGS.filter(x => set.has(x));
  }

  function fillSuggestions() {
    const set = new Set([...(GENRES[PP.getLang()] || GENRES.english), ...L.allGenres(PP.state.library)]);
    $('genreSuggestions').innerHTML = Array.from(set).map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
    $('collectionSuggestions').innerHTML = L.allCollections(PP.state.library).map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  }

  // ---------- hero ----------
  function ring(p, done) {
    const r = 26, c = 2 * Math.PI * r;
    return `<svg class="ring ${done ? 'done' : ''}" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="${r}" class="ringBg"/>
      <circle cx="32" cy="32" r="${r}" class="ringFg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(1)}"/>
      <text x="32" y="37" text-anchor="middle">${Math.floor(p)}%</text></svg>`;
  }

  function renderHero(g) {
    $('editTitle').textContent = g.name || `App ${g.appid}`;
    const sub = [t('edit.sub', { id: g.appid })];
    if (g.lastPlayedSec) sub.push(t('edit.lastPlayed', { d: timeAgo(g.lastPlayedSec * 1000) }));
    $('editSub').textContent = sub.join(' · ');
    $('heroCollections').innerHTML = L.collectionsOf(g).map(c => `<span class="miniChip">${escapeHtml(c)}</span>`).join('');

    const cover = $('editCover');
    cover.classList.remove('broken');
    cover.parentElement.classList.remove('noCover');
    cover.dataset.coverAppid = g.appid;
    cover.dataset.title = g.name || '';
    cover.dataset.step = '0';
    cover.src = g.coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`;
    const bg = safeUrl(g.heroUrl || g.coverUrl || '');
    $('heroBg').style.backgroundImage = bg ? `url("${bg}")` : '';

    const done = L.isDone(g);
    const has = Number(g.achTotal) > 0;
    const p = L.pct(g.achUnlocked, g.achTotal);
    const d = L.effectiveDifficulty(g);
    const h = L.hltbHours(g);
    const left = L.hltbLeft(g);
    const stats = [];
    stats.push(`<div class="hStat ringStat">${ring(has ? p : 0, done)}<div><span>${escapeHtml(t('hero.progress'))}</span><b>${has ? `${Number(g.achUnlocked) || 0}/${Number(g.achTotal)}` : escapeHtml(g.noStats ? t('card.noAch') : '—')}</b></div></div>`);
    stats.push(`<div class="hStat"><span>${escapeHtml(t('hero.hours'))}</span><b>${fmtNum(L.effectiveHours(g), 1)}</b></div>`);
    stats.push(`<div class="hStat"><span>${escapeHtml(t('hero.difficulty'))}</span><b>${d.value == null ? '—' : `${d.estimated ? '~' : ''}${d.value}/10`}</b>${d.estimated ? `<small>${escapeHtml(t('hero.estimated'))}</small>` : ''}</div>`);
    if (PP.state.settings.hltbEnabled !== false || g.hltbManual) {
      const hl = h != null ? `~${fmtNum(h, 0)} h` : (g.hltb && !g.hltb.at ? '…' : '—');
      stats.push(`<div class="hStat" id="hltbStat"><span>${escapeHtml(t('hltb.label'))}</span><b>${hl}</b>${left != null ? `<small>${escapeHtml(left > 0 ? t('hltb.left', { h: fmtNum(left, 0) }) : t('hltb.over'))}</small>` : ''}</div>`);
    }
    if (done && g.completedAtSec) stats.push(`<div class="hStat gold"><span>${escapeHtml(t('hero.completed'))}</span><b>💎 ${escapeHtml(fmtDate(g.completedAtSec * 1000, false))}</b></div>`);
    $('heroStats').innerHTML = stats.join('');
    $('hltbLinkBtn').hidden = !(g.hltb && g.hltb.id);
  }

  // ---------- "My data" tab ----------
  function renderCollections() {
    const box = $('collectionChips');
    const input = $('collectionInput');
    box.querySelectorAll('.chip').forEach(c => c.remove());
    for (const c of collections) {
      const el = document.createElement('span');
      el.className = 'chip';
      el.innerHTML = `${escapeHtml(c)} <button type="button" data-remove-col="${escapeHtml(c)}" aria-label="×">×</button>`;
      box.insertBefore(el, input);
    }
  }

  function fillForm(g) {
    $('editStatus').value = g.status || '';
    $('editRating').value = L.hasValue(g.rating) ? g.rating : '';
    $('editDifficulty').value = L.hasValue(g.difficulty) ? g.difficulty : '';
    $('editManualHours').value = L.hasValue(g.manualHours) && Number(g.manualHours) > 0 ? g.manualHours : '';
    $('editHltbManual').value = L.hasValue(g.hltbManual) && Number(g.hltbManual) > 0 ? g.hltbManual : '';
    $('editGenrePrimary').value = g.genrePrimary || '';
    $('editGenreSecondary').value = g.genreSecondary || '';
    $('editNotes').value = g.notes || '';
    collections = L.collectionsOf(g).slice();
    $('collectionInput').value = '';
    renderCollections();
    fillHints(g);
    initialForm = formSnapshot();

    const desc = $('editDescription');
    desc.textContent = g.description || '';
    desc.hidden = !g.description;

    const alert = $('editAlert');
    if (g.newAchAlert) {
      alert.innerHTML = `<span>⚠ ${escapeHtml(t('edit.newAchAlert', { n: g.newAchAlert.added || 1 }))}</span> <button class="btn small" type="button" id="dismissAlertBtn">${escapeHtml(t('edit.dismiss'))}</button>`;
      alert.hidden = false;
    } else {
      alert.hidden = true;
      alert.innerHTML = '';
    }
  }

  function fillHints(g) {
    $('estDiffHint').textContent = L.hasValue(g.estDifficulty)
      ? t('edit.estimated', { d: g.estDifficulty, p: fmtNum(g.rarestPct, 1) })
      : t('edit.noEstimate');
    $('steamHoursHint').textContent = t('edit.steamHours', { h: fmtNum(Number(g.hours) || 0, 1) });
    const c = g.hltb && g.hltb.comp100;
    $('hltbHint').textContent = c ? t('hltb.hint', { h: fmtNum(c, 1) }) : t('hltb.none');
  }

  function readForm() {
    return {
      status: $('editStatus').value,
      rating: $('editRating').value,
      difficulty: $('editDifficulty').value,
      manualHours: $('editManualHours').value,
      hltbManual: $('editHltbManual').value,
      genrePrimary: $('editGenrePrimary').value.trim(),
      genreSecondary: $('editGenreSecondary').value.trim(),
      collections: collections.slice(),
      notes: $('editNotes').value.trim()
    };
  }
  function formSnapshot() { return JSON.stringify({ ...readForm(), pendingCollection: $('collectionInput').value.trim() }); }
  function isDirty() { return !!current && initialForm !== '' && formSnapshot() !== initialForm; }

  function switchTab(tab) {
    document.querySelectorAll('[data-sheettab]').forEach(b => b.classList.toggle('on', b.dataset.sheettab === tab));
    document.querySelectorAll('[data-sheetpane]').forEach(p => { p.hidden = p.dataset.sheetpane !== tab; });
  }

  function replaceInLibrary(game) {
    const idx = PP.state.library.findIndex(x => Number(x.appid) === Number(game.appid));
    if (idx >= 0) PP.state.library[idx] = game;
  }

  async function open(appid, { tab = 'ach' } = {}) {
    const g = PP.gameById(appid);
    if (!g) return;
    current = Number(appid);
    const seq = ++openSeq;
    fillSuggestions();
    renderHero(g);
    fillForm(g);
    switchTab(tab);
    achievements = [];
    $('achSearch').value = '';
    $('achievementsList').innerHTML = `<div class="muted pad">${escapeHtml(t('common.loading'))}</div>`;
    $('nextTarget').innerHTML = '';
    $('achCount').textContent = '';
    document.body.classList.add('modalOpen');
    if (!$('editModal').open) $('editModal').showModal();
    loadHltb(seq);
    await loadAchievements(false, seq);
  }

  async function loadHltb(seq) {
    const g = PP.gameById(current);
    if (!g || PP.state.settings.hltbEnabled === false) return;
    if (g.hltb && g.hltb.at) return;
    const res = await window.api.hltb(current);
    if (seq !== openSeq || !res || !res.hltb) return;
    const game = PP.gameById(current);
    if (game) { game.hltb = res.hltb; renderHero(game); fillHints(game); }
  }

  async function loadAchievements(refresh, seq = openSeq) {
    if (refresh) $('achRefreshBtn').disabled = true;
    try {
      const res = await window.api.achievements(current, { refresh });
      if (seq !== openSeq) return; // another game was opened meanwhile
      achievements = (res && res.achievements) || [];
      if (res && res.game) {
        const keepHltb = (PP.gameById(current) || {}).hltb;
        replaceInLibrary({ ...res.game, hltb: res.game.hltb || keepHltb });
        renderHero(PP.gameById(current));
        fillHints(PP.gameById(current));
      }
    } catch {
      achievements = [];
    } finally {
      $('achRefreshBtn').disabled = false;
    }
    renderAchievements();
  }

  // ---------- achievements ----------
  function iconFor(a) {
    return a.unlocked
      ? (a.localIconUrl || a.iconUrl || '')
      : (a.localGrayIconUrl || a.iconGrayUrl || a.localIconUrl || a.iconUrl || '');
  }

  function renderAchievements() {
    const list = $('achievementsList');
    const g = PP.gameById(current) || {};
    const live = achievements.filter(a => a.existsInCurrentSteamData !== false);
    $('achCount').textContent = live.length ? t('ach.count', { u: live.filter(a => a.unlocked).length, t: live.length }) : '';

    if (!achievements.length) {
      list.innerHTML = `<div class="muted pad">${escapeHtml(g.noStats ? t('ach.noStats') : t('ach.notSynced'))}</div>`;
      $('nextTarget').innerHTML = '';
      return;
    }

    const f = $('achFilter').value;
    const s = $('achSort').value;
    const term = $('achSearch').value.trim().toLowerCase();
    let items = achievements.slice();
    if (f === 'unlocked') items = items.filter(a => a.unlocked);
    if (f === 'locked') items = items.filter(a => !a.unlocked);
    if (f === 'hidden') items = items.filter(a => a.hidden);
    if (f.startsWith('tag:')) items = items.filter(a => tagsOf(a).includes(f.slice(4)));
    if (f === 'noted') items = items.filter(a => (a.userNote || '').trim());
    if (term) items = items.filter(a => `${a.displayName} ${a.description} ${a.userNote || ''}`.toLowerCase().includes(term));

    const pctOf = (a) => (a.globalPct == null ? -1 : a.globalPct);
    if (s === 'easy') items.sort((a, b) => (a.unlocked - b.unlocked) || (pctOf(b) - pctOf(a)));
    if (s === 'rare') items.sort((a, b) => (pctOf(a) < 0) - (pctOf(b) < 0) || pctOf(a) - pctOf(b));
    if (s === 'recent') items.sort((a, b) => (b.unlockTimeSec || 0) - (a.unlockTimeSec || 0));

    // Next target: most common locked achievement still on Steam.
    const next = live.filter(a => !a.unlocked).sort((a, b) => pctOf(b) - pctOf(a))[0];
    const showNext = next && (f === 'all' || f === 'locked') && !term;
    if (showNext) items = items.filter(a => a !== next);
    $('nextTarget').innerHTML = showNext
      ? `<div class="nextTarget"><div class="nextLabel">🎯 ${escapeHtml(t('ach.next'))} <span class="muted">— ${escapeHtml(t('ach.nextHint'))}</span></div>${rowHTML(next, true)}</div>`
      : '';

    list.innerHTML = items.length
      ? items.map(a => rowHTML(a, false)).join('')
      : `<div class="muted pad">${escapeHtml(t('ach.none'))}</div>`;
  }

  function rowHTML(a, isNext) {
    const icon = safeUrl(iconFor(a));
    const fallback = safeUrl(a.unlocked ? a.iconUrl : (a.iconGrayUrl || a.iconUrl));
    const desc = a.description || (a.hidden ? t('ach.hiddenDesc') : '');
    const tags = tagsOf(a);
    const badges = [];
    badges.push(a.unlocked
      ? `<span class="achBadge ok">${escapeHtml(t('ach.unlocked'))} · ${escapeHtml(fmtDate(a.unlockTimeSec ? a.unlockTimeSec * 1000 : a.unlockDate, false))}</span>`
      : `<span class="achBadge locked">${escapeHtml(t('ach.locked'))}</span>`);
    if (a.globalPct != null) badges.push(`<span class="achBadge ${rarityClass(a.globalPct)}">${escapeHtml(t('ach.global', { p: fmtNum(a.globalPct, 1) }))}</span>`);
    if (a.hidden) badges.push(`<span class="achBadge hid">${escapeHtml(t('ach.hidden'))}</span>`);
    for (const tg of tags) badges.push(`<span class="achBadge tag-${tg}">${TAG_ICON[tg]} ${escapeHtml(t(`tag.${tg}`))}</span>`);
    if (a.existsInCurrentSteamData === false) badges.push(`<span class="achBadge">${escapeHtml(t('ach.removed'))}</span>`);
    const api = escapeHtml(a.achievementApiName);
    const tagPicker = TAGS.map(tg => `<button type="button" class="tagToggle ${tags.includes(tg) ? 'on' : ''} tag-${tg}" data-tag="${tg}">${TAG_ICON[tg]} ${escapeHtml(t(`tag.${tg}`))}</button>`).join('');
    return `
      <div class="achRow ${a.unlocked ? 'unlocked' : 'locked'} ${isNext ? 'next' : ''}" data-api="${api}">
        <img class="achIcon ${!a.unlocked && !a.localGrayIconUrl && !a.iconGrayUrl ? 'noGray' : ''}" src="${icon}" ${fallback && fallback !== icon ? `data-fallback="${fallback}"` : ''} alt="" loading="lazy"/>
        <div class="achMeta">
          <div class="achName">${escapeHtml(a.displayName || a.achievementApiName)}</div>
          ${desc ? `<div class="achDesc muted">${escapeHtml(desc)}</div>` : ''}
          <div class="achBadges">${badges.join('')}</div>
          ${a.userNote ? `<div class="achNoteText">📝 ${escapeHtml(a.userNote)}</div>` : ''}
          <div class="achTagPicker" hidden>${tagPicker}</div>
          <div class="achNoteEdit" hidden><textarea data-ach-note placeholder="${escapeHtml(t('ach.notePh'))}">${escapeHtml(a.userNote || '')}</textarea></div>
        </div>
        <div class="achTools">
          <button type="button" class="achTool ${tags.length ? 'on' : ''}" data-ach-act="tags" title="${escapeHtml(t('ach.tags'))}">🏷</button>
          <button type="button" class="achTool ${a.userNote ? 'on' : ''}" data-ach-act="note" title="${escapeHtml(t('ach.note'))}">✎</button>
        </div>
      </div>`;
  }

  async function updateAch(apiName, patch) {
    const a = achievements.find(x => x.achievementApiName === apiName);
    if (!a) return;
    Object.assign(a, patch);
    if (patch.tags) a.missable = patch.tags.includes('missable');
    await window.api.updateAchievement(current, apiName, patch);
  }

  // ---------- save / delete ----------
  function addCollectionFromInput() {
    const input = $('collectionInput');
    const v = input.value.trim().slice(0, 40);
    if (v && !collections.includes(v)) collections.push(v);
    input.value = '';
    renderCollections();
  }

  async function save() {
    const g = PP.gameById(current);
    if (!g) return;
    if ($('collectionInput').value.trim()) addCollectionFromInput();
    const form = readForm();
    const patch = { appid: current, ...form };
    // Lock genres only when the user actually changed them, so the store can still
    // fill them in for a game that was saved before its details arrived.
    if (form.genrePrimary !== (g.genrePrimary || '') || form.genreSecondary !== (g.genreSecondary || '')) patch.genreLocked = true;
    const res = await window.api.updateGame(patch);
    if (res && res.ok) {
      PP.toast(t('edit.saved'), 'ok', 2000);
      initialForm = '';
      $('editModal').close();
      await PP.refreshLibrary();
      PP.render();
    } else {
      PP.toast(PP.errorText(res && res.error), 'error');
    }
  }

  async function remove() {
    const g = PP.gameById(current);
    if (!g) return;
    const name = g.name || `App ${g.appid}`;
    const ok = await PP.confirmDialog(t('edit.deleteConfirm', { name }), t('common.delete'));
    if (!ok) return;
    await window.api.removeGame(current);
    initialForm = '';
    $('editModal').close();
    PP.toast(t('edit.deleted', { name }), 'ok');
    await PP.refreshLibrary();
    PP.render();
  }

  function bind() {
    $('saveGameBtn').addEventListener('click', save);
    $('deleteGameBtn').addEventListener('click', remove);
    $('editModal').addEventListener('close', () => { document.body.classList.remove('modalOpen'); openSeq++; initialForm = ''; });

    // Closing with Esc, ✕ or "Close" asks first if "My data" has unsaved changes.
    let asking = false;
    const guardedClose = async () => {
      if (asking) return;
      if (!isDirty()) { $('editModal').close(); return; }
      asking = true;
      const discard = await PP.confirmDialog(t('edit.unsaved'), t('edit.discard'));
      asking = false;
      if (discard) { initialForm = ''; $('editModal').close(); }
    };
    $('editModal').addEventListener('cancel', (e) => { e.preventDefault(); guardedClose(); });
    $('editForm').addEventListener('submit', (e) => {
      if (e.submitter && e.submitter.value === 'cancel') { e.preventDefault(); guardedClose(); }
    });
    document.querySelectorAll('[data-sheettab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.sheettab)));
    $('achFilter').addEventListener('change', renderAchievements);
    $('achSort').addEventListener('change', () => { try { localStorage.setItem('pp.achSort', $('achSort').value); } catch {} renderAchievements(); });
    $('achSearch').addEventListener('input', PP.debounce(renderAchievements, 150));
    $('achRefreshBtn').addEventListener('click', () => loadAchievements(true));
    try { const s = localStorage.getItem('pp.achSort'); if (s) $('achSort').value = s; } catch {}

    document.querySelectorAll('[data-game-link]').forEach(b => b.addEventListener('click', () => PP.openLink(b.dataset.gameLink, current)));
    $('hltbLinkBtn').addEventListener('click', () => {
      const g = PP.gameById(current);
      if (g && g.hltb && g.hltb.id) window.api.openExternal(`https://howlongtobeat.com/game/${Number(g.hltb.id)}`);
    });

    // Collections chip input
    $('collectionInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCollectionFromInput(); }
      if (e.key === 'Backspace' && !e.target.value && collections.length) { collections.pop(); renderCollections(); }
    });
    $('collectionInput').addEventListener('change', () => { if ($('collectionInput').value.trim()) addCollectionFromInput(); });
    $('collectionChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove-col]');
      if (b) { collections = collections.filter(c => c !== b.dataset.removeCol); renderCollections(); return; }
      $('collectionInput').focus();
    });

    $('editAlert').addEventListener('click', async (e) => {
      if (!e.target.closest('#dismissAlertBtn')) return;
      await window.api.updateGame({ appid: current, newAchAlert: null });
      const g = PP.gameById(current);
      if (g) g.newAchAlert = null;
      $('editAlert').hidden = true;
      PP.render();
    });

    const panel = $('editModal');
    panel.addEventListener('click', async (e) => {
      const tagBtn = e.target.closest('[data-tag]');
      if (tagBtn) {
        const api = tagBtn.closest('.achRow').dataset.api;
        const a = achievements.find(x => x.achievementApiName === api);
        if (!a) return;
        const set = new Set(tagsOf(a));
        if (set.has(tagBtn.dataset.tag)) set.delete(tagBtn.dataset.tag); else set.add(tagBtn.dataset.tag);
        await updateAch(api, { tags: TAGS.filter(x => set.has(x)) });
        renderAchievements();
        const row = $('editModal').querySelector(`.achRow[data-api="${CSS.escape(api)}"] .achTagPicker`);
        if (row) row.hidden = false; // keep the picker open
        return;
      }
      const btn = e.target.closest('[data-ach-act]');
      if (!btn) return;
      const row = btn.closest('.achRow');
      if (!row) return;
      const box = row.querySelector(btn.dataset.achAct === 'tags' ? '.achTagPicker' : '.achNoteEdit');
      box.hidden = !box.hidden;
      if (!box.hidden && btn.dataset.achAct === 'note') box.querySelector('textarea').focus();
    });
    panel.addEventListener('focusout', async (e) => {
      const ta = e.target.closest && e.target.closest('textarea[data-ach-note]');
      if (!ta) return;
      const api = ta.closest('.achRow').dataset.api;
      const a = achievements.find(x => x.achievementApiName === api);
      const val = ta.value.trim();
      if (a && (a.userNote || '') !== val) {
        await updateAch(api, { userNote: val });
        renderAchievements();
      }
    });
  }

  Object.assign(PP, { openEditor: open, bindEditor: bind, tagsOf });
})(window.PP);
