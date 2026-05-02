const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  getPrinters:  ()                 => ipcRenderer.invoke('get-printers'),
  savePrinter:  (name, printAfter) => ipcRenderer.invoke('save-printer', name, printAfter),
  getUrl:       ()                 => ipcRenderer.invoke('get-url'),
  saveUrl:      (url)              => ipcRenderer.invoke('save-url', url),
  closeApp:     ()                 => ipcRenderer.invoke('close-app'),
  onInit:       (cb)               => ipcRenderer.on('init', (_, data) => cb(data)),
});
