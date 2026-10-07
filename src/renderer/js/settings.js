(function (PP) {
  'use strict';
  const { t, $, escapeHtml } = PP;

  const PRESETS = [
    ['#C832A0', 'Magenta'], ['#3B82F6', 'Azul / Blue'], ['#22C55E', 'Verde / Green'],
    ['#F97316', 'Naranja / Orange'], ['#A855F7', 'Morado / Purple'], ['#EAB308', 'Oro / Gold'], ['#06B6D4', 'Cian / Cyan']
  ];
  let pendingAccent = null;

  function applyTheme(accent) {
    const hex = String(accent || '#C832A0').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return;
    const root = document.documentElement;
    root.style.setProperty('--accent', `#${hex}`);
    root.style.setProperty('--accent-rgb', `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`);
  }

  function renderSwatches(current) {
    const cur = String(current || '').toUpperCase();
    const isPreset = PRESETS.some(([c]) => c === cur);
    $('swatches').innerHTML = PRESETS.map(([c, name]) =>
      `<button type="button" class="swatch ${c === cur ? 'on' : ''}" data-color="${c}" title="${escapeHtml(name)}" style="--c:${c}"></button>`
    ).join('') + `<label class="swatch custom ${!isPreset ? 'on' : ''}" title="${escapeHtml(t('settings.custom'))}" style="--c:${isPreset ? '#888888' : cur}">
      <input type="color" id="customColor" value="${isPreset ? '#C832A0' : cur.toLowerCase()}"/><span>＋</span></label>`;
  }

  function updateText(st) {
    const s = st || {};
    const map = {
      checking: t('update.checking'), latest: t('update.latest'), error: t('update.error'), dev: t('update.dev'),
      available: t('update.available', { v: s.version }), downloading: t('update.downloading', { p: s.percent || 0 }),
      ready: t('update.ready', { v: s.version })
    };
    return map[s.state] || '';
  }

  function setUpdateStatus(st) {
    const el = $('updateText');
    if (el) { const txt = updateText(st); el.textContent = txt ? `· ${txt}` : ''; }
    PP.showUpdateBanner(st);
  }

  async function open() {
    const res = await window.api.getSettings();
    const s = (res && res.settings) || {};
    $('steamApiKey').value = '';
    $('apiKeyHint').textContent = s.hasApiKey
      ? t('settings.keySaved', { enc: s.keyEncrypted ? t('settings.keyEncrypted') : '' })
      : t('settings.keyMissing');
    $('steamApiKey').placeholder = s.hasApiKey ? '••••••••••••••••••••••••••••••••' : '';
    $('clearKeyWrap').hidden = !s.hasApiKey;
    $('clearApiKey').checked = false;
    $('steamId').value = s.steamId || '';
    $('language').value = s.language || 'spanish';
    $('achLanguage').value = s.achLanguage || 'auto';
    $('syncMinutes').value = s.syncMinutes || 30;
    $('yearlyGoal').value = s.yearlyGoal || '';
    $('notifications').checked = s.notifications !== false;
    $('closeToTray').checked = s.closeToTray !== false;
    $('startWithWindows').checked = !!s.startWithWindows;
    $('hltbEnabled').checked = s.hltbEnabled !== false;
    pendingAccent = s.themeAccent || '#C832A0';
    renderSwatches(pendingAccent);
    $('settingsError').hidden = true;
    const info = await window.api.appInfo();
    $('appVersion').textContent = info ? `v${info.version}` : '';
    setUpdateStatus(info && info.update);
    $('settingsModal').showModal();
  }

  async function save() {
    const btn = $('saveSettingsBtn');
    btn.disabled = true;
    const res = await window.api.setSettings({
      steamApiKey: $('steamApiKey').value.trim(),
      clearApiKey: $('clearApiKey').checked,
      steamId: $('steamId').value.trim(),
      language: $('language').value,
      achLanguage: $('achLanguage').value,
      syncMinutes: Number($('syncMinutes').value) || 30,
      yearlyGoal: Number($('yearlyGoal').value) || 0,
      notifications: $('notifications').checked,
      closeToTray: $('closeToTray').checked,
      startWithWindows: $('startWithWindows').checked,
      hltbEnabled: $('hltbEnabled').checked,
      themeAccent: pendingAccent
    });
    btn.disabled = false;
    if (!res || !res.ok) {
      const err = $('settingsError');
      const key = `err.${res && res.error}`;
      err.textContent = t(key) === key ? PP.errorText(res && res.error) : t(key);
      err.hidden = false;
      return;
    }
    const langChanged = PP.state.settings.language !== res.settings.language;
    const credsChanged = PP.state.settings.steamId !== res.settings.steamId || PP.state.settings.hasApiKey !== res.settings.hasApiKey || !!$('steamApiKey').value.trim();
    PP.state.settings = res.settings;
    applyTheme(res.settings.themeAccent);
    if (langChanged) { PP.setLang(res.settings.language); PP.applyI18n(); }
    $('settingsModal').close();
    PP.toast(t('settings.saved'), 'ok', 2000);
    PP.render();
    if (credsChanged && res.settings.hasApiKey && res.settings.steamId) PP.runSync(false);
  }

  function bind() {
    $('settingsBtn').addEventListener('click', open);
    $('saveSettingsBtn').addEventListener('click', save);
    $('settingsModal').addEventListener('close', () => applyTheme(PP.state.settings.themeAccent));
    $('swatches').addEventListener('click', (e) => {
      const b = e.target.closest('button.swatch');
      if (!b) return;
      pendingAccent = b.dataset.color;
      renderSwatches(pendingAccent);
      applyTheme(pendingAccent);
    });
    $('swatches').addEventListener('input', (e) => {
      if (e.target.id !== 'customColor') return;
      pendingAccent = e.target.value.toUpperCase();
      applyTheme(pendingAccent);
      const lab = e.target.closest('.swatch');
      $('swatches').querySelectorAll('.swatch').forEach(s => s.classList.remove('on'));
      lab.classList.add('on');
      lab.style.setProperty('--c', pendingAccent);
    });
    $('checkUpdateBtn').addEventListener('click', async () => { setUpdateStatus({ state: 'checking' }); setUpdateStatus(await window.api.checkUpdate()); });
    window.api.on('update:status', setUpdateStatus);
  }

  Object.assign(PP, { openSettings: open, bindSettings: bind, applyTheme });
})(window.PP);
