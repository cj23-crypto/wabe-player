const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", {
  openFiles:      () => ipcRenderer.invoke("open-files"),
  openFolder:     () => ipcRenderer.invoke("open-folder"),
  openFolderPath: (p) => ipcRenderer.invoke("open-folder-path", p),
});
