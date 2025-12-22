const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Helps Windows correctly associate taskbar/window icons with the app.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.muertemil.platinumpath');
}

const store = new Store({
  name: 'library',
  defaults: {
    settings: { steamApiKey: '', steamId: '', language: 'english', syncMinutes: 5, themeAccent: '#C832A0' },
    selectedAppIds: [],
    games: {},   // appid -> game object
    lastSync: 0
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    backgroundColor: '#0e1116',
    // Prefer .ico on Windows so the icon shows in the title bar and taskbar.
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  // Remove the native menu bar (File/Edit/View/Window/Help) permanently.
  // Keeps the normal window frame controls (min/max/close).
  Menu.setApplicationMenu(null);
  createWindow();
  scheduleAutoSync();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Open external links in the user's default browser.
ipcMain.handle('shell:openExternal', async (_evt, url) => {
  try {
    if (typeof url !== 'string') return { ok: false };
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return { ok: false };
    await shell.openExternal(u);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function getSettings() { return store.get('settings'); }
function setSettings(next) { store.set('settings', { ...getSettings(), ...(next || {}) }); }
function getSelected() { return store.get('selectedAppIds') || []; }
function setSelected(appids) {
  store.set('selectedAppIds', Array.from(new Set((appids || []).map(x => Number(x)).filter(Boolean))));
}
function getGamesMap() { return store.get('games') || {}; }
function upsertGame(appid, patch) {
  const games = getGamesMap();
  const prev = games[appid] || {};
  games[appid] = { ...prev, ...patch, appid: Number(appid) };
  store.set('games', games);
  return games[appid];
}
function setLastSync(ts) { store.set('lastSync', ts); }
function getLastSync() { return store.get('lastSync') || 0; }

function minutesToMs(m) { return Math.max(1, Number(m) || 5) * 60_000; }
let syncTimer = null;
function scheduleAutoSync() {
  if (syncTimer) clearInterval(syncTimer);
  const { syncMinutes } = getSettings();
  syncTimer = setInterval(() => { syncSelected().catch(() => {}); }, minutesToMs(syncMinutes));
}

// --- Steam API helpers ---
const STEAM_BASE = 'https://api.steampowered.com';

async function steamGet(pathname, params) {
  const url = new URL(STEAM_BASE + pathname);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`Steam API error ${res.status}`);
  return await res.json();
}

function iconUrl(appid, hash) {
  if (hash) return `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg`;
  return '';
}
function headerUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

async function fetchStoreGenres(appid) {
  // Stable fallback: Steam Store appdetails genres.
  // Steam does not reliably expose user-defined tags (e.g. "Precision Platformer") via a stable public API.
  try{
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return [];
    const json = await res.json();
    const data = json?.[String(appid)]?.data;

    const genres = (data?.genres || []).map(g => g.description).filter(Boolean);
    const ordered = genres.filter(g => g !== 'Indie').concat(genres.filter(g => g === 'Indie'));
    return ordered.slice(0, 2);
  }catch{
    return [];
  }
}



async function fetchOwnedGames() {
  const { steamApiKey, steamId, language } = getSettings();
  if (!steamApiKey || !steamId) throw new Error('Falta API key o steamId');
  const data = await steamGet('/IPlayerService/GetOwnedGames/v1/', {
    key: steamApiKey,
    steamid: steamId,
    include_appinfo: true,
    include_played_free_games: true,
    language: language || 'english'
  });
  const list = data?.response?.games || [];
  return list.map(g => ({
    appid: g.appid,
    name: g.name || `App ${g.appid}`,
    playtime_minutes: g.playtime_forever || 0,
    img_icon_url: g.img_icon_url || '',
    icon: iconUrl(g.appid, g.img_icon_url),
    header: headerUrl(g.appid)
  }));
}

async function fetchPlayerAchievements(appid) {
  const { steamApiKey, steamId, language } = getSettings();
  const data = await steamGet('/ISteamUserStats/GetPlayerAchievements/v1/', {
    key: steamApiKey,
    steamid: steamId,
    appid,
    l: language || 'english'
  });
  const list = data?.playerstats?.achievements || [];
  const unlocked = list.filter(a => Number(a.achieved) === 1).length;
  let lastUnlockTimeSec = null;
  for (const a of list) {
    if (Number(a.achieved) === 1 && Number(a.unlocktime) > 0) {
      lastUnlockTimeSec = Math.max(lastUnlockTimeSec || 0, Number(a.unlocktime));
    }
  }
  return { total: list.length, unlocked, lastUnlockTimeSec };
}



async function syncOne(appid) {
  const now = Date.now();
  let ach = { total: 0, unlocked: 0, lastUnlockTimeSec: null };

  try { ach = await fetchPlayerAchievements(appid); } catch {}

  const current = getGamesMap()[appid] || {};
  let completedAtSec = current.completedAtSec || null;

  const isComplete = (Number(ach.total) || 0) > 0 && (Number(ach.unlocked) || 0) >= (Number(ach.total) || 0);
  if (isComplete && !completedAtSec && ach.lastUnlockTimeSec) {
    completedAtSec = ach.lastUnlockTimeSec;
  }

  // Do NOT overwrite manual difficulty.
  return upsertGame(appid, { coverUrl: headerUrl(appid), 
    achUnlocked: ach.unlocked,
    achTotal: ach.total,
    lastUnlockTimeSec: ach.lastUnlockTimeSec || current.lastUnlockTimeSec || null,
    completedAtSec,
    updatedAt: now
  });
}


async function syncSelected() {
  const selected = getSelected();
  if (!selected.length) return { ok: true, synced: 0 };
  let count = 0;
  for (const appid of selected) {
    await syncOne(appid);
    count++;
  }
  const now = Date.now();
  setLastSync(now);
  return { ok: true, synced: count, at: now };
}

// --- IPC API ---
async function fetchAppDetails(appid) {
  try{
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const data = j?.[String(appid)]?.data;
    if (!data) return null;
    const genres = (data.genres || []).map(g=>g.description).filter(Boolean);
    return {
      name: data.name || '',
      header_image: data.header_image || '',
      short_description: data.short_description || '',
      genres
    };
  }catch{
    return null;
  }
}

ipcMain.handle('settings:get', async () => ({ settings: getSettings(), lastSync: getLastSync() }));
ipcMain.handle('settings:set', async (e, next) => { setSettings(next); scheduleAutoSync(); return { ok: true, settings: getSettings() }; });

ipcMain.handle('library:list', async () => {
  const gamesMap = getGamesMap();
  const list = Object.values(gamesMap).sort((a,b)=> (a.name||'').localeCompare(b.name||'', 'es'));
  return { games: list, lastSync: getLastSync(), selected: getSelected() };
});

ipcMain.handle('steam:ownedGames', async () => {
  const list = await fetchOwnedGames();
  return { games: list };
});

ipcMain.handle('library:addSelected', async (e, appids) => {
  const owned = await fetchOwnedGames();
  const want = new Set((appids || []).map(Number));
  setSelected([...getSelected(), ...want]);

  const now = Date.now();
  const ownedMap = new Map(owned.map(g => [g.appid, g]));
  for (const appid of want) {
    const og = ownedMap.get(appid);
    if (!og) continue;
    upsertGame(appid, {
      name: og.name,
      hours: (Number(og.playtime_minutes) || 0) / 60,
      coverUrl: og.header || og.icon || '',
      genrePrimary: '',
      genreSecondary: '',
      genreLocked: false,
      manualHours: null,
      description: '',
      notes: '',
      createdAt: now,
      updatedAt: now
    });
        const genres = await fetchStoreGenres(appid);
        if (genres.length) {
          upsertGame(appid, { genrePrimary: genres[0] || '', genreSecondary: genres[1] || '' });
        }
  }
  return { ok: true, selected: getSelected() };
});


ipcMain.handle('library:removeGame', async (_e, appid) => {
  const id = Number(appid);
  if (!id) return { ok: false };

  // Remove from games map
  const games = getGamesMap();
  const existed = Object.prototype.hasOwnProperty.call(games, id);
  if (existed) {
    delete games[id];
    store.set('games', games);
  }

  // Also remove from the selected list to avoid future sync attempts
  const selected = getSelected().filter(x => Number(x) !== id);
  setSelected(selected);

  return { ok: true, removed: existed };
});

ipcMain.handle('library:updateManual', async (e, patch) => {
  if (!patch?.appid) return { ok: false };
  const appid = Number(patch.appid);
  const next = { ...patch };
  delete next.appid;
  next.updatedAt = Date.now();
  const g = upsertGame(appid, next);
  return { ok: true, game: g };
});

ipcMain.handle('steam:syncNow', async () => {
  const selected = new Set(getSelected());
  if (selected.size === 0) return { ok: true, synced: 0 };

  // update hours/name/cover from owned games
  try{
    const owned = await fetchOwnedGames();
    const ownedMap = new Map(owned.map(g => [g.appid, g]));
    for (const appid of selected) {
      const og = ownedMap.get(appid);
      if (!og) continue;
      upsertGame(appid, {
        name: og.name,
        hours: (Number(og.playtime_minutes) || 0) / 60,
        coverUrl: og.header || og.icon || ''
      });
      // Fetch genres once (if missing)
      const current = getGamesMap()[appid];
      if (!current?.genrePrimary) {
        const genres = await fetchStoreGenres(appid);
        if (genres.length) {
          const cur = getGamesMap()[appid] || {};
          const locked = !!cur.genreLocked;
          const missing = !cur.genrePrimary && !cur.genreSecondary;
          if (!locked || missing) {
            upsertGame(appid, { genrePrimary: genres[0] || '', genreSecondary: genres[1] || '' });
          }
        }
      }
    }
  } catch {}

  return await syncSelected();
});

ipcMain.handle('backup:export', async () => {
  const payload = { version: 1, exportedAt: new Date().toISOString(), data: store.store };
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Exportar biblioteca',
    defaultPath: `mi-biblioteca-steam_${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  require('fs').writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return { ok: true, filePath };
});

ipcMain.handle('backup:import', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Importar biblioteca',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths?.[0]) return { ok: false };
  const raw = require('fs').readFileSync(filePaths[0], 'utf-8');
  const json = JSON.parse(raw);
  const next = json?.data || json;
  if (!next) return { ok: false };
  store.store = next;
  scheduleAutoSync();
  return { ok: true };
});
