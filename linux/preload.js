// Exposes window.electronHost to the shared engine (same role as AndroidHost on Android).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronHost', {
  close: () => ipcRenderer.send('destroyer:close'),
});
