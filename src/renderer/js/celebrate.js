(function (PP) {
  'use strict';
  // 100% celebration: confetti + a card with the game.
  const { t, $, escapeHtml } = PP;

  const queue = [];
  let running = false;

  function confetti(ms = 3800) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const c = $('confetti');
    const ctx = c.getContext('2d');
    c.hidden = false;
    const W = c.width = window.innerWidth, H = c.height = window.innerHeight;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C832A0';
    const colors = [accent, '#FFCD3C', '#FFFFFF', '#7CC4FF', '#7BE495'];
    const parts = Array.from({ length: 180 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.35,
      vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const start = performance.now();
    const step = (now) => {
      const el = now - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - el / ms);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (el < ms) requestAnimationFrame(step);
      else { ctx.clearRect(0, 0, W, H); c.hidden = true; }
    };
    requestAnimationFrame(step);
  }

  function showNext() {
    if (running || !queue.length) return;
    running = true;
    const { appid, name } = queue.shift();
    const g = PP.gameById(appid) || { appid, name };
    const box = $('celebrate');
    box.innerHTML = `<div class="celebrateCard">
      <div class="celebrateCover">${PP.coverImg(g)}</div>
      <div class="celebrateTitle">💎 ${escapeHtml(t('celebrate.title'))}</div>
      <div class="celebrateName">${escapeHtml(g.name || name || '')}</div>
      <button class="btn primary" type="button" data-celebrate-close>${escapeHtml(t('celebrate.close'))}</button>
    </div>`;
    box.hidden = false;
    confetti();
    const close = () => { box.hidden = true; box.innerHTML = ''; running = false; setTimeout(showNext, 300); };
    box.onclick = (e) => { if (e.target === box || e.target.closest('[data-celebrate-close]')) close(); };
    setTimeout(() => { if (!box.hidden) close(); }, 9000);
  }

  // The same 100% can arrive twice (full sync + "now playing" refresh): celebrate it once.
  const recent = new Map();
  function celebrate(items) {
    const now = Date.now();
    for (const it of items || []) {
      if (!it || !it.appid) continue;
      if (now - (recent.get(it.appid) || 0) < 120000) continue;
      recent.set(it.appid, now);
      queue.push(it);
    }
    showNext();
  }

  Object.assign(PP, { celebrate });
})(window.PP);
