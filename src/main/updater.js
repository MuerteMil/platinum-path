'use strict';
// Update checks.
// - Installed version (NSIS installer): electron-updater downloads and installs from GitHub Releases.
// - ZIP/portable version: checks the latest GitHub release and offers a link.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const REPO = 'MuerteMil/platinum-path';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

let emit = () => {};
let autoUpdater = null;
let state = { state: 'idle' };

function setState(s) { state = s; emit('update:status', s); }
function getState() { return state; }

function isInstalledBuild() {
  try { return app.isPackaged && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml')); } catch { return false; }
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function checkGitHub() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PlatinumPath' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) { setState({ state: 'error' }); return; }
    const j = await res.json();
    const latest = String(j.tag_name || '').replace(/^v/i, '');
    if (latest && compareVersions(latest, app.getVersion()) > 0) {
      setState({ state: 'available', version: latest, url: j.html_url || RELEASES_URL, canInstall: false });
    } else {
      setState({ state: 'latest' });
    }
  } catch {
    setState({ state: 'error' });
  }
}

function init({ emitter }) {
  if (emitter) emit = emitter;
  if (!app.isPackaged) return;
  if (isInstalledBuild()) {
    try {
      ({ autoUpdater } = require('electron-updater'));
      autoUpdater.autoDownload = false;
      autoUpdater.on('update-available', (info) => setState({ state: 'available', version: info.version, url: RELEASES_URL, canInstall: true }));
      autoUpdater.on('update-not-available', () => setState({ state: 'latest' }));
      autoUpdater.on('download-progress', (p) => setState({ state: 'downloading', percent: Math.round(p.percent || 0) }));
      autoUpdater.on('update-downloaded', (info) => setState({ state: 'ready', version: info.version }));
      autoUpdater.on('error', () => setState({ state: 'error' }));
    } catch {
      autoUpdater = null;
    }
  }
  setTimeout(check, 8000);
}

async function check() {
  if (!app.isPackaged) { setState({ state: 'dev' }); return state; }
  setState({ state: 'checking' });
  if (autoUpdater) {
    try { await autoUpdater.checkForUpdates(); } catch { await checkGitHub(); }
  } else {
    await checkGitHub();
  }
  return state;
}

async function download() {
  if (!autoUpdater) return false;
  try { await autoUpdater.downloadUpdate(); return true; } catch { setState({ state: 'error' }); return false; }
}

function install() {
  if (autoUpdater && state.state === 'ready') autoUpdater.quitAndInstall();
}

module.exports = { init, check, download, install, getState, compareVersions, RELEASES_URL };
