const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
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
    achievements: {}, // appid -> { [apiName]: achievementObj }
    achievementChanges: [], // change history
    lastSync: 0
  }
});
ensureStoreShape();

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
function getAchievementsMap() { return store.get('achievements') || {}; }
function setAchievementsMap(next) { store.set('achievements', next || {}); }
function getAchievementChanges() { return store.get('achievementChanges') || []; }
function pushAchievementChange(change) {
  const list = getAchievementChanges();
  list.push(change);
  if (list.length > 10000) list.splice(0, list.length - 10000);
  store.set('achievementChanges', list);
}
function ensureStoreShape() {
  const s = store.store || {};
  if (!s.achievements || typeof s.achievements !== 'object') s.achievements = {};
  if (!Array.isArray(s.achievementChanges)) s.achievementChanges = [];
  store.store = s;
}
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

async function fetchGlobalAchievementSchema(appid) {
  const { steamApiKey, language } = getSettings();
  if (!steamApiKey) return [];
  const data = await steamGet('/ISteamUserStats/GetSchemaForGame/v2/', { key: steamApiKey, appid, l: language || 'english' });
  const list = data?.game?.availableGameStats?.achievements || [];
  return list.map(a => ({
    apiName: a.name || '',
    displayName: a.displayName || '',
    description: a.description || '',
    hidden: Number(a.hidden) === 1,
    icon: a.icon || '',
    icongray: a.icongray || ''
  })).filter(a => a.apiName);
}

function toIso(ts = Date.now()) { try { return new Date(ts).toISOString(); } catch { return null; } }
function achievementDir(appid) { return path.join(app.getPath('userData'), 'achievement-icons', String(appid)); }
function ensureDir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
function sanitizeName(name) { return String(name || '').replace(/[^\w.-]/g, '_'); }
async function downloadIconIfMissing(url, filePath) {
  if (!url || !filePath) return;
  try { if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return; } catch {}
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, buf);
  } catch {}
}

function trackChange(appid, apiName, type, oldValue, newValue) {
  pushAchievementChange({ appId: Number(appid), achievementApiName: apiName, changeType: type, oldValue, newValue, changedAt: toIso() });
}

async function syncGameAchievements(appid) {
  const nowIso = toIso();
  const numericAppid = Number(appid);
  if (!Number.isFinite(numericAppid) || numericAppid <= 0) {
    console.warn('[achievements] invalid appid for sync:', appid);
    return [];
  }

  const settings = getSettings() || {};
  const steamApiKey = String(settings.steamApiKey || '').trim();
  const steamId = String(settings.steamId || '').trim();
  if (!steamApiKey) console.warn('[achievements] missing Steam API key in settings (appid=%s)', numericAppid);
  if (!steamId) console.warn('[achievements] missing SteamID64 in settings (appid=%s)', numericAppid);

  console.log('[achievements] sync start appid=%s', numericAppid);

  let schema = [];
  let schemaOk = false;
  try {
    schema = await fetchGlobalAchievementSchema(numericAppid);
    schemaOk = Array.isArray(schema);
  } catch (err) {
    console.warn('[achievements] schema fetch failed appid=%s error=%s', numericAppid, err?.message || err);
  }

  let playerAchievements = [];
  let playerOk = false;
  try {
    const player = await steamGet('/ISteamUserStats/GetPlayerAchievements/v1/', { key: steamApiKey, steamid: steamId, appid: numericAppid, l: settings.language || 'english' });
    playerAchievements = player?.playerstats?.achievements || [];
    playerOk = Array.isArray(playerAchievements);
  } catch (err) {
    console.warn('[achievements] player achievements fetch failed appid=%s error=%s', numericAppid, err?.message || err);
  }

  const playerMap = new Map((playerAchievements || []).map(a => [a.apiname, a]));
  const root = getAchievementsMap();
  const prevGame = root[numericAppid] || {};
  const nextGame = { ...prevGame };
  const seen = new Set();

  for (const sch of (schema || [])) {
    const apiName = sch.apiName;
    if (!apiName) continue;
    seen.add(apiName);
    const p = playerMap.get(apiName);
    const prev = nextGame[apiName] || {};
    const unlocked = playerOk ? Number(p?.achieved) === 1 : !!prev.unlocked;
    const unlockTimeSec = playerOk ? (Number(p?.unlocktime) > 0 ? Number(p.unlocktime) : null) : (prev.unlockTimeSec || null);
    const baseName = sanitizeName(apiName);
    const dir = achievementDir(numericAppid);
    const localIconPath = path.join(dir, `${baseName}.png`);
    const localGrayPath = path.join(dir, `${baseName}_gray.png`);
    await downloadIconIfMissing(sch.icon, localIconPath);
    await downloadIconIfMissing(sch.icongray, localGrayPath);
    const next = {
      appId: numericAppid,
      achievementApiName: apiName,
      displayName: sch.displayName || prev.displayName || apiName,
      description: sch.description || prev.description || '',
      hidden: typeof sch.hidden === 'boolean' ? sch.hidden : !!prev.hidden,
      unlocked,
      unlockTimeSec,
      unlockDate: unlockTimeSec ? toIso(unlockTimeSec * 1000) : null,
      iconUrl: sch.icon || prev.iconUrl || '',
      iconGrayUrl: sch.icongray || prev.iconGrayUrl || '',
      localIconPath: fs.existsSync(localIconPath) ? localIconPath : (prev.localIconPath || ''),
      localGrayIconPath: fs.existsSync(localGrayPath) ? localGrayPath : (prev.localGrayIconPath || ''),
      firstSeenAt: prev.firstSeenAt || nowIso,
      lastSeenAt: nowIso,
      lastSyncedAt: nowIso,
      existsInCurrentSteamData: true,
      preservedLocalOnly: false
    };
    nextGame[apiName] = next;
  }

  if (schemaOk) {
    for (const [apiName, old] of Object.entries(nextGame)) {
      if (seen.has(apiName)) continue;
      if (!old || typeof old !== 'object') continue;
      nextGame[apiName] = { ...old, lastSyncedAt: nowIso, existsInCurrentSteamData: false, preservedLocalOnly: true };
    }
  } else {
    console.warn('[achievements] keeping local achievements because schema fetch failed appid=%s', numericAppid);
  }

  root[numericAppid] = nextGame;
  setAchievementsMap(root);
  const result = Object.values(nextGame);
  if (!result.length) console.log('[achievements] no achievements available appid=%s', numericAppid);
  console.log('[achievements] sync end appid=%s saved=%s schemaOk=%s playerOk=%s', numericAppid, result.length, schemaOk, playerOk);
  return result;
}



async function syncOne(appid) {
  const now = Date.now();
  let ach = { total: 0, unlocked: 0, lastUnlockTimeSec: null };

  try { ach = await fetchPlayerAchievements(appid); } catch {}
  try { await syncGameAchievements(appid); } catch {}

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
  return { games: list, lastSync: getLastSync(), selected: getSelected(), achievements: getAchievementsMap() };
});

ipcMain.handle('steam:ownedGames', async () => {
  try {
    const list = await fetchOwnedGames();
    return { ok: true, games: list };
  } catch (err) {
    return { ok: false, games: [], error: err?.message || 'No se pudo cargar la biblioteca de Steam' };
  }
});

ipcMain.handle('library:addSelected', async (e, appids) => {
  let owned = [];
  try {
    owned = await fetchOwnedGames();
  } catch {
    // Allow adding AppIDs manually even when Steam API credentials are missing/invalid.
    owned = [];
  }
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
  const payload = { version: 2, exportedAt: new Date().toISOString(), data: store.store, achievements: getAchievementsMap(), achievementChanges: getAchievementChanges() };
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
  if (json?.achievements && typeof json.achievements === 'object') store.set('achievements', json.achievements);
  if (Array.isArray(json?.achievementChanges)) store.set('achievementChanges', json.achievementChanges);
  ensureStoreShape();
  scheduleAutoSync();
  return { ok: true };
});

ipcMain.handle('achievements:byGame', async (_e, appid) => {
  try {
    await syncGameAchievements(appid);
  } catch (err) {
    console.warn('[achievements] on-open sync failed appid=%s error=%s', appid, err?.message || err);
  }
  const all = getAchievementsMap();
  const game = all?.[Number(appid)] || {};
  const changes = getAchievementChanges().filter(c => Number(c.appId) === Number(appid));
  return { ok: true, achievements: Object.values(game), changes };
});
