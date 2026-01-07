import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  copyToSongs: (filePaths: string[]) => ipcRenderer.invoke("copy-to-songs", filePaths),
  loadSongs: () => ipcRenderer.invoke("load-songs"),
  getSongsDir: () => ipcRenderer.invoke("get-songs-dir"),
  log: (message: string) => ipcRenderer.send("renderer-log", message),
});
