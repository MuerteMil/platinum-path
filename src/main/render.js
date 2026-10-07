'use strict';
// Renders a self-contained HTML page offscreen and returns it as a PNG.
// Used by the showcase and the recap image exports.

const MAX_H = 16000;

/** Script injected into export pages: broken covers fall back to the new Steam CDN, then to the game name. */
const COVER_FALLBACK_JS = `
document.querySelectorAll('img[data-appid]').forEach(function (img) {
  function fail() {
    var alt = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/' + img.dataset.appid + '/header.jpg';
    if (img.dataset.tried !== '1' && img.src !== alt) { img.dataset.tried = '1'; img.src = alt; return; }
    var box = img.parentElement; img.remove();
    if (box) { box.classList.add('noimg'); box.setAttribute('data-name', img.dataset.name || ''); }
  }
  img.addEventListener('error', fail);
  if (img.complete && img.naturalWidth === 0) fail();
});`;

async function htmlToPng(html, { width, height = 1200 }) {
  const { BrowserWindow } = require('electron');
  const w = new BrowserWindow({
    show: false, width, height: Math.min(MAX_H, height), useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, javascript: true }
  });
  try {
    await w.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(html).toString('base64'));
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      const ready = await w.webContents.executeJavaScript('Array.from(document.images).every(i => i.complete) && document.fonts.status === "loaded"');
      if (ready) break;
      await new Promise(r => setTimeout(r, 200));
    }
    // Fallback images may have been swapped in: give them a moment.
    await new Promise(r => setTimeout(r, 500));
    const realH = await w.webContents.executeJavaScript('document.documentElement.scrollHeight');
    w.setContentSize(width, Math.min(MAX_H, Math.ceil(realH)));
    await new Promise(r => setTimeout(r, 400));
    const img = await w.webContents.capturePage();
    return img.toPNG();
  } finally {
    w.destroy();
  }
}

module.exports = { htmlToPng, COVER_FALLBACK_JS };
