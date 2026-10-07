(function (PP) {
  'use strict';
  // First-run setup in three steps: API key → Steam profile → privacy check.
  const { t, $, escapeHtml } = PP;

  const STEPS = ['key', 'profile', 'check'];
  let step = 0;
  let busy = false;
  let checkOk = false;

  function showError(msg) {
    const el = $('wizardError');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function errText(code) {
    const k = `err.${code}`;
    return t(k) === k ? PP.errorText(code) : t(k);
  }

  function render() {
    const s = PP.state.settings || {};
    document.querySelectorAll('#wizardModal [data-wstep]').forEach(p => { p.hidden = p.dataset.wstep !== STEPS[step]; });
    document.querySelectorAll('#wizardModal .wDot').forEach((d, i) => {
      d.classList.toggle('on', i === step);
      d.classList.toggle('done', i < step);
    });
    $('wizardStepLabel').textContent = t('wizard.stepOf', { n: step + 1, total: STEPS.length });
    $('wizardBack').hidden = step === 0;
    $('wizardNext').textContent = step === 2 ? t('wizard.finish') : t('wizard.next');
    $('wizardNext').disabled = busy || (step === 2 && !checkOk);
    if (STEPS[step] === 'key') {
      $('wizardKeySaved').hidden = !s.hasApiKey;
      $('wizardKey').placeholder = s.hasApiKey ? '••••••••••••••••••••••••••••••••' : '';
    }
    if (STEPS[step] === 'profile') {
      if (!$('wizardProfile').value && s.steamId) $('wizardProfile').value = s.steamId;
    }
  }

  async function saveKey() {
    const key = $('wizardKey').value.trim();
    if (!key) {
      if (PP.state.settings.hasApiKey) return true;
      showError(t('wizard.keyRequired'));
      return false;
    }
    const res = await window.api.setSettings({ steamApiKey: key });
    if (!res || !res.ok) { showError(errText(res && res.error)); return false; }
    PP.state.settings = res.settings;
    $('wizardKey').value = '';
    return true;
  }

  async function saveProfile() {
    const v = $('wizardProfile').value.trim();
    if (!v) { showError(t('wizard.profileRequired')); return false; }
    const res = await window.api.setSettings({ steamId: v });
    if (!res || !res.ok) { showError(errText(res && res.error)); return false; }
    PP.state.settings = res.settings;
    return true;
  }

  async function runCheck() {
    checkOk = false;
    const box = $('wizardCheck');
    box.innerHTML = `<div class="muted">${escapeHtml(t('wizard.checking'))}</div>`;
    render();
    const res = await window.api.setupCheck();
    if (res && res.ok) {
      checkOk = true;
      box.innerHTML = `<div class="wResult ok">
          ${PP.safeUrl(res.avatar) ? `<img src="${PP.safeUrl(res.avatar)}" alt=""/>` : ''}
          <div><b>${escapeHtml(t('wizard.hello', { name: res.personaName || '' }))}</b>
          <div class="muted">${escapeHtml(t('wizard.found', { n: PP.fmtNum(res.games), s: PP.fmtNum(res.withStats) }))}</div></div>
        </div>
        ${res.games === 0 ? `<div class="muted hint">${escapeHtml(t('wizard.zeroGames'))}</div>` : ''}`;
    } else {
      const code = (res && res.error) || 'unexpected';
      let help = '', actions = `<button class="btn small" type="button" data-wact="recheck">${escapeHtml(t('wizard.recheck'))}</button>`;
      if (code === 'private') {
        help = t('wizard.privateHelp');
        actions = `<button class="btn small primary" type="button" data-external-url="https://steamcommunity.com/my/edit/settings">${escapeHtml(t('wizard.openPrivacy'))}</button>` + actions;
      } else if (code === 'auth') {
        help = t('wizard.authHelp');
        actions = `<button class="btn small primary" type="button" data-wact="tokey">${escapeHtml(t('wizard.changeKey'))}</button>` + actions;
      } else if (code === 'profile_not_found') {
        actions = `<button class="btn small primary" type="button" data-wact="toprofile">${escapeHtml(t('wizard.changeProfile'))}</button>` + actions;
      }
      box.innerHTML = `<div class="wResult bad">
          <div><b>${escapeHtml(errText(code))}</b>${help ? `<div class="muted">${escapeHtml(help)}</div>` : ''}</div>
        </div>
        <div class="row wActions">${actions}</div>`;
    }
    render();
  }

  async function next() {
    if (busy) return;
    showError('');
    busy = true; render();
    try {
      if (STEPS[step] === 'key') { if (await saveKey()) step = 1; }
      else if (STEPS[step] === 'profile') { if (await saveProfile()) { step = 2; busy = false; await runCheck(); } }
      else if (STEPS[step] === 'check' && checkOk) { finish(); }
    } finally {
      busy = false;
      if ($('wizardModal').open) render();
    }
  }

  function finish() {
    $('wizardModal').close();
    PP.render();
    // First sync in the background, then let the user pick the games to complete.
    PP.runSync(false);
    if (!PP.state.library.length) PP.openAddGames();
  }

  function open() {
    const s = PP.state.settings || {};
    step = s.hasApiKey ? (s.steamId ? 2 : 1) : 0;
    checkOk = false;
    busy = false;
    showError('');
    $('wizardKey').value = '';
    $('wizardProfile').value = s.steamId || '';
    $('wizardLanguage').value = PP.getLang();
    $('wizardCheck').innerHTML = '';
    render();
    if (!$('wizardModal').open) $('wizardModal').showModal();
    if (step === 2) { $('wizardNext').focus(); runCheck(); }
    else (step === 0 ? $('wizardKey') : $('wizardProfile')).focus();
  }

  function bind() {
    $('wizardNext').addEventListener('click', next);
    $('wizardBack').addEventListener('click', () => {
      if (step > 0) { step--; showError(''); render(); }
    });
    $('wizardSkip').addEventListener('click', () => { $('wizardModal').close(); PP.openSettings(); });
    ['wizardKey', 'wizardProfile'].forEach(id => $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); next(); }
    }));
    $('wizardCheck').addEventListener('click', (e) => {
      const b = e.target.closest('[data-wact]');
      if (!b) return;
      if (b.dataset.wact === 'recheck') runCheck();
      if (b.dataset.wact === 'tokey') { step = 0; render(); $('wizardKey').focus(); }
      if (b.dataset.wact === 'toprofile') { step = 1; render(); $('wizardProfile').focus(); }
    });
    // Language can be chosen right away (the app starts in the system language).
    $('wizardLanguage').addEventListener('change', async () => {
      const lang = $('wizardLanguage').value;
      const res = await window.api.setSettings({ language: lang });
      if (res && res.ok) PP.state.settings = res.settings;
      PP.setLang(lang);
      PP.applyI18n();
      PP.render();
      render();
    });
    $('wizardOpenFromMenu').addEventListener('click', open);
  }

  Object.assign(PP, { openWizard: open, bindWizard: bind });
})(window.PP);
