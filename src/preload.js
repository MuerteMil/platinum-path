'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['sync:start', 'sync:progress', 'sync:done', 'library:changed', 'update:status', 'nowPlaying', 'celebrate', 'hltb:progress'];

contextBridge.exposeInMainWorld('api', {
  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (next) => ipcRenderer.invoke('settings:set', next),

  listLibrary: () => ipcRenderer.invoke('library:list'),
  ownedGames: () => ipcRenderer.invoke('library:owned'),
  addGames: (appids, ownedHint) => ipcRenderer.invoke('library:add', appids, ownedHint),
  updateGame: (patch) => ipcRenderer.invoke('library:update', patch),
  reorderGames: (appids) => ipcRenderer.invoke('library:reorder', appids),
  removeGame: (appid) => ipcRenderer.invoke('library:remove', appid),
  refreshDetails: (appid) => ipcRenderer.invoke('library:refreshDetails', appid),

  syncNow: (opts) => ipcRenderer.invoke('steam:sync', opts),
  searchStore: (term) => ipcRenderer.invoke('steam:searchStore', term),

  achievements: (appid, opts) => ipcRenderer.invoke('achievements:get', appid, opts),
  updateAchievement: (appid, apiName, patch) => ipcRenderer.invoke('achievements:update', appid, apiName, patch),
  stats: () => ipcRenderer.invoke('stats:get'),

  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: (texts) => ipcRenderer.invoke('backup:import', texts),

  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  ignoredGames: () => ipcRenderer.invoke('library:ignored'),
  setIgnored: (appid, ignored) => ipcRenderer.invoke('library:setIgnored', appid, ignored),
  fixCover: (appid) => ipcRenderer.invoke('library:fixCover', appid),
  hltb: (appid, opts) => ipcRenderer.invoke('hltb:lookup', appid, opts),
  hltbAll: () => ipcRenderer.invoke('hltb:lookupAll'),
  nowPlaying: () => ipcRenderer.invoke('nowPlaying:get'),
  showcase: () => ipcRenderer.invoke('showcase:get'),
  exportShowcase: (texts) => ipcRenderer.invoke('showcase:export', texts),
  setupCheck: () => ipcRenderer.invoke('setup:check'),
  exportRecap: (payload) => ipcRenderer.invoke('recap:export', payload),

  /** Subscribe to main-process events. Returns an unsubscribe function. */
  on: (channel, fn) => {
    if (!EVENTS.includes(channel)) return () => {};
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
