const { contextBridge, ipcRenderer } = require("electron");

const backendHost = process.env.MTS_BACKEND_HOST || "127.0.0.1";

// NOTE: backendPort is fetched dynamically via IPC because the port is determined
// at runtime by main.cjs after finding an available port. The preload script
// loads before startBackend() completes, so we cannot use process.env here.
let cachedBackendUrl = null;

contextBridge.exposeInMainWorld("mts", {
  // Getter that fetches port from main process on first access
  get backendUrl() {
    if (cachedBackendUrl) return cachedBackendUrl;
    // Fallback: use env var if available (dev mode), otherwise default
    const port = process.env.MTS_BACKEND_PORT || "8000";
    return `http://${backendHost}:${port}`;
  },
  // Async method to get the actual backend URL (preferred)
  getBackendUrl: async () => {
    if (cachedBackendUrl) return cachedBackendUrl;
    try {
      const result = await ipcRenderer.invoke("get-backend-url");
      if (result?.url) {
        cachedBackendUrl = result.url;
        return cachedBackendUrl;
      }
    } catch (e) {
      console.error("[preload] Failed to get backend URL:", e);
    }
    const port = process.env.MTS_BACKEND_PORT || "8000";
    return `http://${backendHost}:${port}`;
  },

  openImportDialog: async () => ipcRenderer.invoke("open-import-dialog"),
  listDirImages: async (dirPath) =>
    ipcRenderer.invoke("list-dir-images", { dirPath }),
  readFile: async (filePath) =>
    ipcRenderer.invoke("read-file", { filePath }),
  selectDirectory: async () => ipcRenderer.invoke("select-directory"),
  saveFileDialog: async (options) =>
    ipcRenderer.invoke("save-file-dialog", options),
  getAppPaths: async () => ipcRenderer.invoke("get-app-paths"),
  restartBackend: async () => ipcRenderer.invoke("restart-backend"),
  openExternal: async (url) => ipcRenderer.invoke("open-external", { url }),
  openPath: async (targetPath) => ipcRenderer.invoke("open-path", { path: targetPath }),
  showItemInFolder: async (filePath) => ipcRenderer.invoke("show-item-in-folder", { path: filePath }),
  windowMinimize: async () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: async () => ipcRenderer.invoke("window-maximize"),
  windowClose: async () => ipcRenderer.invoke("window-close"),
  readDataFile: async (fileName) =>
    ipcRenderer.invoke("read-data-file", { fileName }),
  writeDataFile: async (fileName, data) =>
    ipcRenderer.invoke("write-data-file", { fileName, data }),
  writeBlob: async (base64, mime, dir, name) =>
    ipcRenderer.invoke("write-blob", { base64, mime, dir, name }),
  readBlob: async (key) =>
    ipcRenderer.invoke("read-blob", { key }),
  deleteBlob: async (key) =>
    ipcRenderer.invoke("delete-blob", { key }),
  listBlobKeys: async () =>
    ipcRenderer.invoke("list-blob-keys"),
  resolveBlobDir: async (dir) =>
    ipcRenderer.invoke("resolve-blob-dir", { dir }),
  getBlobStoragePath: async () =>
    ipcRenderer.invoke("get-blob-storage-path"),
  setBlobStoragePath: async (p) =>
    ipcRenderer.invoke("set-blob-storage-path", { path: p }),
  selectBlobStorageDir: async () =>
    ipcRenderer.invoke("select-blob-storage-dir"),
  setTitleBarOverlay: async (color, symbolColor, height) =>
    ipcRenderer.invoke("set-title-bar-overlay", { color, symbolColor, height }),
  deleteOldBlobsDir: async () =>
    ipcRenderer.invoke("delete-old-blobs-dir"),
  onBackendStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("backend-status", handler);
    return () => ipcRenderer.removeListener("backend-status", handler);
  },
});
