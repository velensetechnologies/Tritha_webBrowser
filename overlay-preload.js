const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeApp:     () => ipcRenderer.invoke('close-app'),
  onShow:       (cb) => ipcRenderer.on('overlay-show', cb),
  onHide:       (cb) => ipcRenderer.on('overlay-hide', cb),
});
