const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (next) => ipcRenderer.invoke('settings:set', next),

  listLibrary: () => ipcRenderer.invoke('library:list'),
  ownedGames: () => ipcRenderer.invoke('steam:ownedGames'),
  addSelected: (appids) => ipcRenderer.invoke('library:addSelected', appids),
  updateManual: (patch) => ipcRenderer.invoke('library:updateManual', patch),
  removeGame: (appid) => ipcRenderer.invoke('library:removeGame', appid),

  syncNow: () => ipcRenderer.invoke('steam:syncNow'),

  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  achievementsByGame: (appid) => ipcRenderer.invoke('achievements:byGame', appid),

  // Open external URLs in the user's default browser.
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
