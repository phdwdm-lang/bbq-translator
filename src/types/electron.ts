export interface ElectronMts {
  backendUrl: string;
  openImportDialog: () => Promise<{
    canceled: boolean;
    entries: Array<{ path: string; isDirectory: boolean }>;
  }>;
  listDirImages: (dirPath: string) => Promise<{
    ok: boolean;
    files: string[];
  }>;
  readFile: (filePath: string) => Promise<{
    ok: boolean;
    name?: string;
    mime?: string;
    base64?: string;
  }>;
  selectDirectory: () => Promise<{
    canceled: boolean;
    path?: string;
  }>;
  saveFileDialog: (options: {
    defaultName?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => Promise<{
    canceled: boolean;
    path?: string;
  }>;
  getAppPaths: () => Promise<{
    appDir: string;
    dataDir: string;
    extensionsDir: string;
    logsDir: string;
  }>;
  restartBackend: () => Promise<{ ok: boolean }>;
  openExternal: (url: string) => Promise<void>;
  openPath: (targetPath: string) => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<void>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  readDataFile: (fileName: string) => Promise<{ ok: boolean; data?: string | null }>;
  writeDataFile: (fileName: string, data: string) => Promise<{ ok: boolean }>;
  writeBlob: (base64: string, mime: string, dir?: string, name?: string) => Promise<{ ok: boolean; key: string }>;
  readBlob: (key: string) => Promise<{ ok: boolean; base64?: string; mime?: string }>;
  deleteBlob: (key: string) => Promise<{ ok: boolean }>;
  listBlobKeys: () => Promise<{ ok: boolean; keys: string[] }>;
  resolveBlobDir: (dir: string) => Promise<{ ok: boolean; path: string }>;
  getBlobStoragePath: () => Promise<{ ok: boolean; path: string; isCustom: boolean }>;
  setBlobStoragePath: (path: string) => Promise<{ ok: boolean; path: string }>;
  selectBlobStorageDir: () => Promise<{ canceled: boolean; path: string }>;
  setTitleBarOverlay: (color: string, symbolColor: string, height?: number) => Promise<void>;
  deleteOldBlobsDir: () => Promise<{ ok: boolean; path: string }>;
  onBackendStatus: (callback: (status: string) => void) => () => void;
}

declare global {
  interface Window {
    mts?: ElectronMts;
  }
}
