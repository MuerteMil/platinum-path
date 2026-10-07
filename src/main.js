'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage, screen, Notification, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const data = require('./main/data');
const steam = require('./main/steam');
const sync = require('./main/sync');
const enrich = require('./main/enrich');
const updater = require('./main/updater');
const hltb = require('./main/hltb');
const nowPlaying = require('./main/nowPlaying');
const showcase = require('./main/showcase');
const recap = require('./main/recap');

const START_HIDDEN = process.argv.includes('--hidden');
let tray = null;
let quitting = false;

if (process.platform === 'win32') app.setAppUserModelId('com.muertemil.platinumpath');

// Development-only hooks (ignored in the packaged app): isolated data folder and simulated Steam API.
if (!app.isPackaged && process.env.PP_USER_DATA) app.setPath('userData', process.env.PP_USER_DATA);
const devMock = !app.isPackaged && process.env.PP_MOCK_STEAM ? require(path.resolve(process.env.PP_MOCK_STEAM)) : null;

// Two instances writing the same JSON files would corrupt data.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

let win = null;

function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(true); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ---------- helpers ----------
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const NOTIF_TEXT = {
  english: {
    unlocked: (n, g) => [`🏆 ${n} new achievement${n === 1 ? '' : 's'}`, g],
    completed: (g) => ['💎 100% completed!', g],
    newAch: (g) => ['⚠️ New achievements added', `${g} is no longer at 100%`]
  },
  spanish: {
    unlocked: (n, g) => [`🏆 ${n} logro${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}`, g],
    completed: (g) => ['💎 ¡100% completado!', g],
    newAch: (g) => ['⚠️ Logros nuevos añadidos', `${g} ya no está al 100%`]
  }
};

function notify({ kind, body, count }) {
  const s = data.getSettings();
  if (!s.notifications || !Notification.isSupported()) return;
  const T = NOTIF_TEXT[s.language] || NOTIF_TEXT.english;
  let title, text;
  if (kind === 'unlocked') [title, text] = T.unlocked(count || 1, body);
  else if (kind === 'completed') [title, text] = T.completed(body);
  else if (kind === 'newAch') [title, text] = T.newAch(body);
  else return;
  try {
    const n = new Notification({ title, body: text, icon: path.join(__dirname, 'assets', 'icon.png'), silent: false });
    n.on('click', () => showWindow());
    n.show();
  } catch {}
}

// ---------- window ----------
function restoreBounds() {
  const ws = data.getWindowState();
  const def = { width: 1280, height: 860 };
  if (!ws || !ws.bounds) return { ...def, maximized: false };
  const b = ws.bounds;
  const visible = screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x < a.x + a.width - 50 && b.x + b.width > a.x + 50 && b.y < a.y + a.height - 50 && b.y + 50 > a.y;
  });
  return visible ? { ...b, maximized: !!ws.maximized } : { ...def, maximized: !!ws.maximized };
}

function createWindow(forceShow = false) {
  const { maximized, ...bounds } = restoreBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0e1116',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (maximized) win.maximize();
  win.once('ready-to-show', () => { if (forceShow || !START_HIDDEN) win.show(); });

  const saveState = () => {
    if (!win || win.isDestroyed()) return;
    data.setWindowState({ bounds: win.isMaximized() ? (data.getWindowState() || {}).bounds || win.getBounds() : win.getBounds(), maximized: win.isMaximized() });
  };
  win.on('resize', debounce(saveState, 500));
  win.on('move', debounce(saveState, 500));
  win.on('close', (e) => {
    saveState();
    // Keep running in the tray so sync + notifications continue.
    if (!quitting && tray && data.getSettings().closeToTray) {
      e.preventDefault();
      win.hide();
      trayHint();
    }
  });

  // Never navigate away from the app; external links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => { openExternalSafe(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); openExternalSafe(url); } });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function openExternalSafe(url) {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  const ok = /^https?:\/\//i.test(u) || /^steam:\/\/(run|rungameid|store|nav\/games\/details)\/\d+$/i.test(u);
  if (!ok) return false;
  shell.openExternal(u).catch(() => {});
  return true;
}

// ---------- tray ----------
const TRAY_TEXT = {
  spanish: { open: 'Abrir Platinum Path', sync: 'Sincronizar ahora', quit: 'Salir', hint: 'Platinum Path sigue en la bandeja del sistema. Puedes cambiarlo en Ajustes.' },
  english: { open: 'Open Platinum Path', sync: 'Sync now', quit: 'Quit', hint: 'Platinum Path keeps running in the system tray. You can change this in Settings.' }
};
function trayText() { return TRAY_TEXT[data.getSettings().language] || TRAY_TEXT.english; }

function createTray() {
  if (tray) return;
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'));
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
    tray.setToolTip('Platinum Path');
    tray.on('click', showWindow);
    updateTrayMenu();
  } catch (err) {
    tray = null; // no tray available: closing the window quits normally
  }
}
function updateTrayMenu() {
  if (!tray) return;
  const T = trayText();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: T.open, click: showWindow },
    { label: T.sync, click: () => sync.syncAll({ force: true, reason: 'tray' }).catch(() => {}) },
    { type: 'separator' },
    { label: T.quit, click: () => { quitting = true; app.quit(); } }
  ]));
}
let hintShown = false;
function trayHint() {
  if (hintShown) return;
  hintShown = true;
  try { if (Notification.isSupported()) new Notification({ title: 'Platinum Path', body: trayText().hint, silent: true }).show(); } catch {}
}

function applyLoginItem() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  if (!app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: !!data.getSettings().startWithWindows, args: ['--hidden'] }); } catch {}
}

// ---------- lifecycle ----------
app.whenReady().then(() => {
  if (!gotLock) return;
  Menu.setApplicationMenu(null);
  data.init({ userData: app.getPath('userData'), safeStorage, locale: app.getLocale() });
  if (devMock) devMock.install({ steam, app });
  sync.configure({ emitter: send, notifier: notify });
  enrich.configure({ changed: (ids) => send('library:changed', { appids: ids }) });
  updater.init({ emitter: send });
  nowPlaying.configure({ emitter: send });
  createWindow();
  createTray();
  applyLoginItem();
  nowPlaying.start();
  if (devMock && devMock.afterWindow) devMock.afterWindow({ win, app });
  sync.schedule();
  // Fill any missing names/genres from the store in the background.
  enrich.enqueue(data.getSelected());
  // First sync shortly after start (only games that changed).
  setTimeout(() => sync.syncAll({ reason: 'startup' }).catch(() => {}), 4000);

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { quitting = true; if (gotLock) { sync.stop(); nowPlaying.stop(); data.flushAll(); } });
app.on('window-all-closed', () => { if (gotLock) data.flushAll(); if (process.platform !== 'darwin') app.quit(); });

// ---------- IPC ----------
const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...args) => {
  try { return await fn(...args); } catch (err) {
    console.error('[ipc] %s failed:', ch, err);
    return { ok: false, error: (err && err.kind) || 'unexpected', message: err && err.message };
  }
});

handle('app:info', () => ({ version: app.getVersion(), encryption: data.canEncrypt(), update: updater.getState() }));
handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')).then(() => ({ ok: true })));
handle('shell:openExternal', (url) => ({ ok: openExternalSafe(url) }));

handle('settings:get', () => ({ ok: true, settings: data.publicSettings(), lastSync: data.getLastSync() }));
handle('settings:set', async (next = {}) => {
  // API key: empty field means "keep current"; clearKey removes it.
  if (next.clearApiKey) data.setApiKey('');
  else if (typeof next.steamApiKey === 'string' && next.steamApiKey.trim()) {
    const k = next.steamApiKey.trim();
    if (!/^[0-9A-F]{32}$/i.test(k)) return { ok: false, error: 'invalid_key_format' };
    data.setApiKey(k);
  }
  const patch = { ...next };
  delete patch.steamApiKey; delete patch.clearApiKey;
  // Accept SteamID64, profile URL or custom name.
  if (typeof patch.steamId === 'string') {
    const input = patch.steamId.trim();
    if (input && input !== data.getSettings().steamId) {
      try { patch.steamId = await steam.resolveSteamId(input, data.getApiKey()); }
      catch (err) { return { ok: false, error: err.kind === 'missing_credentials' ? 'need_key_for_vanity' : 'profile_not_found' }; }
      if (patch.steamId !== data.getSettings().steamId) data.setProfile(null); // name/avatar belong to the old profile
    }
  }
  const prevLang = data.steamLanguage();
  data.setSettings(patch);
  sync.schedule();
  applyLoginItem();
  updateTrayMenu();
  // Achievement names come in the selected language: refresh them in the background.
  if (data.steamLanguage() !== prevLang) setTimeout(() => sync.syncAll({ force: true, reason: 'language' }).catch(() => {}), 500);
  return { ok: true, settings: data.publicSettings() };
});

function missableLeft(appid) {
  const list = (data.getAchGame(appid) || {}).list || {};
  let n = 0;
  for (const a of Object.values(list)) if (!a.unlocked && a.existsInCurrentSteamData !== false && (a.missable || (a.tags || []).includes('missable'))) n++;
  return n;
}
handle('library:list', () => ({
  ok: true,
  games: Object.values(data.getGames()).map(g => ({ ...g, missableLeft: missableLeft(g.appid) })),
  lastSync: data.getLastSync(),
  syncing: sync.isRunning()
}));

handle('library:owned', async () => {
  const s = data.getSettings();
  const owned = await steam.getOwnedGames({ key: data.getApiKey(), steamId: s.steamId, language: data.steamLanguage() });
  const ignored = new Set(data.getIgnored());
  return { ok: true, games: owned.map(g => ({ ...g, inLibrary: data.hasGame(g.appid), ignored: ignored.has(g.appid) })) };
});

handle('library:add', async (appids = [], ownedHint = []) => {
  const hint = new Map((ownedHint || []).map(g => [Number(g.appid), g]));
  const added = [];
  let skipped = 0;
  for (const raw of appids) {
    const id = Number(raw);
    if (!id) continue;
    if (data.hasGame(id)) { skipped++; continue; } // never overwrite an existing game
    const h = hint.get(id);
    data.createGame(id, h ? {
      name: String(h.name || ''), coverUrl: steam.headerUrl(id),
      hours: (Number(h.playtimeMinutes) || 0) / 60, playtimeMinutes: Number(h.playtimeMinutes) || 0,
      owned: h.playtimeMinutes != null
    } : { coverUrl: steam.headerUrl(id) });
    added.push(id);
  }
  if (added.length) {
    enrich.enqueue(added);
    // Fetch achievements for the new games in the background.
    setTimeout(() => sync.syncAll({ only: added, reason: 'added' }).catch(() => {}), 300);
  }
  return { ok: true, added: added.length, skipped };
});

handle('library:update', (patch = {}) => {
  const g = data.updateGameFromUI(patch.appid, patch);
  return g ? { ok: true, game: g } : { ok: false, error: 'not_found' };
});

handle('library:reorder', (appids) => { data.reorderPriorities(appids); return { ok: true }; });
handle('library:remove', (appid) => ({ ok: true, removed: data.removeGame(appid) }));
handle('library:refreshDetails', (appid) => { enrich.enqueue([appid], { force: true }); return { ok: true }; });

handle('steam:sync', (opts = {}) => sync.syncAll({ force: !!opts.force, reason: 'manual' }));
handle('steam:searchStore', async (term) => {
  const t = String(term || '').trim();
  if (!t) return { ok: true, items: [] };
  const items = await steam.searchStore(t);
  return { ok: true, items: items.map(i => ({ ...i, inLibrary: data.hasGame(i.appid) })) };
});

handle('achievements:get', async (appid, opts = {}) => {
  const g = data.getGame(appid);
  if (!g) return { ok: false, error: 'not_found' };
  // Refresh only if it has been a while, not every time the editor opens.
  const stale = !g.achSyncedAt || Date.now() - g.achSyncedAt > 10 * 60000;
  if ((opts.refresh || stale) && data.getApiKey() && data.getSettings().steamId && !g.noStats) {
    try { await sync.syncGame(appid); } catch (err) { /* show local data */ }
  }
  return { ok: true, achievements: sync.achievementsForUI(appid), changes: data.getChanges(appid), game: data.getGame(appid) };
});

handle('achievements:update', (appid, apiName, patch) => {
  const a = data.updateAchievementUserData(appid, apiName, patch);
  return a ? { ok: true } : { ok: false, error: 'not_found' };
});

handle('stats:get', () => {
  const games = data.getGames();
  const all = data.allAchievements();
  const unlocks = [];
  for (const [appid, g] of Object.entries(all)) {
    const name = (games[appid] && games[appid].name) || '';
    if (!games[appid]) continue;
    for (const a of Object.values((g && g.list) || {})) {
      if (a.unlocked && a.unlockTimeSec) {
        unlocks.push({ appid: Number(appid), t: a.unlockTimeSec, pct: a.globalPct ?? null, name: a.displayName, game: name, icon: steam.normalizeIconUrl(a.iconUrl) });
      }
    }
  }
  return { ok: true, unlocks };
});

handle('backup:export', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Platinum Path',
    defaultPath: `platinum-path-backup_${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  data.flushAll();
  fs.writeFileSync(filePath, JSON.stringify(data.exportPayload(), null, 2), 'utf-8');
  return { ok: true, filePath };
});

handle('backup:import', async (texts = {}) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Platinum Path', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
  let parsed;
  try { parsed = data.parseBackup(JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'))); }
  catch { return { ok: false, error: 'invalid_file' }; }
  if (!parsed.ok) return parsed;

  const current = Object.keys(data.getGames()).length;
  const msg = String(texts.confirm || 'Replace current library ({current} games) with the backup ({incoming} games)?')
    .replace('{current}', current).replace('{incoming}', parsed.summary.games);
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning', buttons: [texts.cancel || 'Cancel', texts.ok || 'Import'], defaultId: 1, cancelId: 0,
    title: 'Platinum Path', message: msg, detail: texts.detail || ''
  });
  if (response !== 1) return { ok: false, canceled: true };

  // Automatic safety copy of the current data.
  data.flushAll();
  const dir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const safety = path.join(dir, `before-import_${Date.now()}.json`);
  fs.writeFileSync(safety, JSON.stringify(data.exportPayload(), null, 2), 'utf-8');

  parsed.apply();
  sync.schedule();
  enrich.enqueue(data.getSelected());
  return { ok: true, games: parsed.summary.games, safetyCopy: safety };
});

handle('update:check', () => updater.check());
handle('update:download', () => updater.download());
handle('update:install', () => { updater.install(); return { ok: true }; });

// ---------- ignored games, covers, HowLongToBeat, now playing, showcase ----------
handle('library:ignored', () => ({ ok: true, appids: data.getIgnored() }));
handle('library:setIgnored', (appid, ignored) => ({ ok: true, appids: data.setIgnored(appid, !!ignored) }));
handle('library:fixCover', async (appid) => ({ ok: true, url: await enrich.fixCover(appid) }));

handle('hltb:lookup', async (appid, opts = {}) => {
  if (!data.getSettings().hltbEnabled && !opts.force) return { ok: true, hltb: null };
  const v = await hltb.lookup(appid, opts);
  return { ok: true, hltb: v };
});
let hltbAllRunning = false;
handle('hltb:lookupAll', async () => {
  if (hltbAllRunning) return { ok: true, running: true };
  hltbAllRunning = true;
  const ids = Object.values(data.getGames()).filter(g => !g.hltb || g.hltb.error).map(g => g.appid);
  (async () => {
    let done = 0;
    for (const id of ids) {
      try { await hltb.lookup(id); } catch {}
      done++;
      send('hltb:progress', { done, total: ids.length });
      if (done % 5 === 0 || done === ids.length) send('library:changed', { appids: [] });
    }
    hltbAllRunning = false;
  })();
  return { ok: true, total: ids.length };
});

handle('nowPlaying:get', () => ({ ok: true, current: nowPlaying.get() }));

handle('showcase:get', () => ({ ok: true, games: showcase.collect(), profile: data.getProfile() }));
handle('showcase:export', async (texts = {}) => {
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Platinum Path',
    defaultPath: `platinum-path-vitrina_${new Date().toISOString().slice(0, 10)}.png`,
    filters: [{ name: 'PNG', extensions: ['png'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const png = await showcase.renderImage({ texts, accent: data.getSettings().themeAccent, steamName: texts.steamName || '' });
  fs.writeFileSync(filePath, png);
  return { ok: true, filePath };
});

// ---------- first-run setup ----------
/** Checks that the saved key + profile work and that game details are public. */
handle('setup:check', async () => {
  const key = data.getApiKey();
  const steamId = data.getSettings().steamId;
  if (!key || !steamId) return { ok: false, error: 'missing_credentials' };
  let profile = null;
  try {
    profile = await steam.getPlayerSummary({ key, steamId });
  } catch (err) {
    return { ok: false, error: err.kind || 'network' };
  }
  if (!profile) return { ok: false, error: 'profile_not_found' };
  data.setProfile(profile);
  try {
    const owned = await steam.getOwnedGames({ key, steamId, language: data.steamLanguage() });
    return { ok: true, personaName: profile.personaName, avatar: profile.avatar, games: owned.length, withStats: owned.filter(g => g.hasStats).length };
  } catch (err) {
    return { ok: false, error: err.kind || 'network', personaName: profile.personaName, avatar: profile.avatar };
  }
});

// ---------- recap image ----------
handle('recap:export', async (payload = {}) => {
  const texts = payload.texts || {};
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Platinum Path',
    defaultPath: `platinum-path-${String(texts.fileTag || 'recap').replace(/[^\w.-]+/g, '-')}.png`,
    filters: [{ name: 'PNG', extensions: ['png'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const png = await recap.renderImage({
    recap: payload.recap || {}, texts,
    accent: data.getSettings().themeAccent,
    steamName: (data.getProfile() || {}).personaName || ''
  });
  fs.writeFileSync(filePath, png);
  return { ok: true, filePath };
});
