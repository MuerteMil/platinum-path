(function (PP) {
  'use strict';
  const t = (...a) => PP.t(...a);

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  /** Only allow http(s)/file URLs in src attributes. */
  function safeUrl(u) {
    const s = String(u || '').trim();
    return /^(https?:|file:)/i.test(s) ? escapeHtml(s) : '';
  }

  function fmtDate(ts, withTime = true) {
    if (!ts) return '—';
    try {
      const opts = withTime
        ? { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
        : { year: 'numeric', month: 'short', day: 'numeric' };
      return new Date(ts).toLocaleString(PP.locale(), opts);
    } catch { return '—'; }
  }

  function timeAgo(ts) {
    if (!ts) return t('bar.never');
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return t('time.ago.now');
    if (s < 3600) return t('time.ago.min', { n: Math.floor(s / 60) });
    if (s < 86400) return t('time.ago.h', { n: Math.floor(s / 3600) });
    if (s < 86400 * 14) return t('time.ago.d', { n: Math.floor(s / 86400) });
    return fmtDate(ts, false);
  }

  function fmtNum(n, digits = 0) {
    return Number(n || 0).toLocaleString(PP.locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }

  // ---------- toasts ----------
  function toast(message, kind = 'info', ms = 4500) {
    const box = $('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    el.addEventListener('click', () => el.remove());
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  }

  // ---------- confirm dialog ----------
  function confirmDialog(text, okLabel) {
    return new Promise(resolve => {
      const dlg = $('confirmModal');
      $('confirmText').textContent = text;
      $('confirmOk').textContent = okLabel || t('common.delete');
      $('confirmCancel').textContent = t('common.cancel');
      const onClose = () => { dlg.removeEventListener('close', onClose); resolve(dlg.returnValue === 'ok'); };
      dlg.returnValue = '';
      dlg.addEventListener('close', onClose);
      dlg.showModal();
      $('confirmCancel').focus();
    });
  }

  // ---------- Steam links ----------
  const links = {
    play: (id) => `steam://run/${id}`,
    store: (id) => `https://store.steampowered.com/app/${id}/`,
    achievements: (id) => `https://steamcommunity.com/my/stats/${id}/achievements/`,
    guides: (id) => `https://steamcommunity.com/app/${id}/guides/`
  };
  function openLink(kind, appid) {
    const f = links[kind];
    if (f) window.api.openExternal(f(Number(appid)));
  }

  // External links anywhere in the app: <a data-external-url="…">
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-external-url]');
    if (!el) return;
    e.preventDefault();
    window.api.openExternal(el.getAttribute('data-external-url'));
  });

  // ---------- game covers ----------
  // Steam moved images of recent games to hashed URLs, so the classic
  // ".../apps/<id>/header.jpg" can fail. Fallback chain:
  //   stored URL → new CDN path → ask the store for the real URL → placeholder with the name.
  const CDN_OLD = (id) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;
  const CDN_NEW = (id) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`;

  function coverImg(g, cls = '') {
    const id = Number(g.appid);
    const src = safeUrl(g.coverUrl || CDN_OLD(id));
    return `<img class="${cls}" alt="" loading="lazy" decoding="async" src="${src}" data-cover-appid="${id}" data-title="${escapeHtml(g.name || '')}"/>`;
  }

  const coverFixes = new Map(); // appid -> Promise<url>
  function fixCoverOnce(id) {
    if (!coverFixes.has(id)) coverFixes.set(id, window.api.fixCover(id).then(r => (r && r.url) || '').catch(() => ''));
    return coverFixes.get(id);
  }

  function coverFailed(img) {
    img.classList.add('broken');
    const box = img.parentElement;
    if (box) { box.classList.add('noCover'); box.setAttribute('data-title', img.dataset.title || ''); }
  }

  // Broken images (replaces inline onerror handlers, which the CSP blocks).
  document.addEventListener('error', async (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    const id = Number(el.dataset.coverAppid);
    if (id) {
      const step = Number(el.dataset.step || 0);
      el.dataset.step = String(step + 1);
      if (step === 0 && el.src !== CDN_NEW(id)) { el.src = CDN_NEW(id); return; }
      if (step <= 1) {
        const url = await fixCoverOnce(id);
        if (url && url !== el.src) {
          el.src = url;
          const g = PP.gameById && PP.gameById(id);
          if (g) g.coverUrl = url;
          return;
        }
      }
      coverFailed(el);
      return;
    }
    if (el.dataset.fallback && el.src !== el.dataset.fallback) { el.src = el.dataset.fallback; return; }
    el.classList.add('broken');
  }, true);

  function errorText(code) {
    const key = `sync.err.${code}`;
    const s = t(key);
    return s === key ? t('sync.err.unexpected') : s;
  }

  Object.assign(PP, { coverImg, $, escapeHtml, safeUrl, fmtDate, timeAgo, fmtNum, debounce, toast, confirmDialog, openLink, errorText });
})(window.PP);
