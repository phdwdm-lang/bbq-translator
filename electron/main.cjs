const { app, BrowserWindow, dialog, ipcMain, shell, Menu, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn, execSync } = require("child_process");
const http = require("http");

// ────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────
const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT_START = 8000;
const BACKEND_PORT_END = 8010;
const HEALTH_CHECK_PATH = "/health";
const HEALTH_CHECK_INTERVAL_MS = 500;
const HEALTH_CHECK_TIMEOUT_MS = 180_000;
const AUTO_RESTART_MAX_RETRIES = 3;
const AUTO_RESTART_COOLDOWN_MS = 5_000;

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff",
]);

const IMPORT_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff",
  "zip", "cbz", "cbr", "rar", "pdf", "epub", "mobi",
];

const MIME_MAP = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".zip": "application/zip",
  ".cbz": "application/zip",
  ".cbr": "application/zip",
  ".rar": "application/zip",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".mobi": "application/x-mobipocket-ebook",
};

const BUNDLED_MODELS = [
  { subDir: "detection", fileName: "detect-20241225.ckpt" },
  { subDir: "ocr", fileName: "ocr_ar_48px.ckpt" },
  { subDir: "ocr", fileName: "alphabet-all-v7.txt" },
  { subDir: "inpainting", fileName: "inpainting_lama_mpe.ckpt" },
];

// ────────────────────────────────────────────
// Paths
// ────────────────────────────────────────────
const IS_PACKAGED = app.isPackaged;

function resolveBackendDir() {
  if (IS_PACKAGED) {
    return path.join(process.resourcesPath, "backend");
  }
  return process.env.MTS_BACKEND_DIR || path.resolve(__dirname, "..", "..", "manga-backend");
}

function resolvePythonExe() {
  if (IS_PACKAGED) {
    return path.join(process.resourcesPath, "python", "python.exe");
  }
  return process.env.MTS_PYTHON_EXE || "python";
}

function resolveDataDir() {
  if (IS_PACKAGED) {
    return path.join(app.getPath("userData"), "data");
  }
  return process.env.MTS_DATA_DIR || path.join(app.getPath("userData"), "data");
}

function resolveExtensionsDir() {
  return path.join(resolveDataDir(), "extensions");
}

function resolveLogsDir() {
  return path.join(resolveDataDir(), "logs");
}

function resolveBundledModelsDir() {
  if (IS_PACKAGED) {
    return path.join(process.resourcesPath, "bundled-models");
  }
  return "";
}

function ensureBundledModels() {
  if (!IS_PACKAGED) return;

  const bundledDir = resolveBundledModelsDir();
  const targetDir = path.join(resolveDataDir(), "models");

  if (!bundledDir || !fs.existsSync(bundledDir)) {
    console.log("[electron] No bundled models directory found, skipping copy");
    return;
  }

  let copiedCount = 0;
  let skippedCount = 0;

  for (const model of BUNDLED_MODELS) {
    const srcPath = path.join(bundledDir, model.subDir, model.fileName);
    const dstPath = path.join(targetDir, model.subDir, model.fileName);

    if (fs.existsSync(dstPath)) {
      skippedCount++;
      continue;
    }

    if (!fs.existsSync(srcPath)) {
      console.warn(`[electron] Bundled model not found: ${srcPath}`);
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
      console.log(`[electron] Copied model: ${model.subDir}/${model.fileName}`);
      copiedCount++;
    } catch (err) {
      console.error(`[electron] Failed to copy model ${model.fileName}:`, err);
    }
  }

  if (copiedCount > 0) {
    console.log(`[electron] Copied ${copiedCount} bundled models to ${targetDir}`);
  }
  if (skippedCount > 0) {
    console.log(`[electron] Skipped ${skippedCount} models (already exist)`);
  }
}

// ────────────────────────────────────────────
// Utility helpers
// ────────────────────────────────────────────
const extToMime = (ext) => MIME_MAP[(ext || "").toLowerCase()] || "application/octet-stream";

const listImagesRecursive = (dirPath) => {
  const out = [];
  const walk = (p) => {
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(p, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        if (IMAGE_EXTENSIONS.has(path.extname(ent.name).toLowerCase())) out.push(full);
      }
    }
  };
  walk(dirPath);
  out.sort((a, b) => a.localeCompare(b));
  return out;
};

// ────────────────────────────────────────────
// Backend lifecycle
// ────────────────────────────────────────────
let backendProcess = null;
let backendPort = BACKEND_PORT_START;
let intentionalStop = false;
let autoRestartCount = 0;
let lastCrashTime = 0;
let backendStartTime = 0;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = require("net").createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, BACKEND_HOST);
  });
}

async function findAvailablePort() {
  for (let port = BACKEND_PORT_START; port <= BACKEND_PORT_END; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port in range ${BACKEND_PORT_START}-${BACKEND_PORT_END}`);
}

function healthCheck(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: BACKEND_HOST, port, path: HEALTH_CHECK_PATH, timeout: 2000 },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(res.statusCode >= 200 && res.statusCode < 400));
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackendReady(port, timeoutMs = HEALTH_CHECK_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await healthCheck(port)) return true;
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }
  return false;
}

async function startBackend() {
  killStaleBackendProcesses();
  backendPort = await findAvailablePort();
  console.log(`[electron] Starting backend on port ${backendPort}...`);

  const pythonExe = resolvePythonExe();
  const backendDir = resolveBackendDir();
  const logsDir = resolveLogsDir();

  fs.mkdirSync(logsDir, { recursive: true });

  const logFile = path.join(logsDir, `backend-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const dataDir = resolveDataDir();
  const hfHome = path.join(dataDir, "hf_home");
  const backendEnv = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    MTS_BACKEND_PORT: String(backendPort),
    MTS_BACKEND_HOST: BACKEND_HOST,
    MTS_BASE_PATH: dataDir,
    MTS_CODE_PATH: backendDir,
    HF_HOME: hfHome,
    HF_HUB_CACHE: path.join(hfHome, "hub"),
    TRANSFORMERS_CACHE: path.join(hfHome, "transformers"),
  };

  const args = [
    "start_backend.py",
    "--host", BACKEND_HOST,
    "--port", String(backendPort),
    "--log-dir", logsDir,
  ];

  console.log(`[electron] MTS_BASE_PATH: ${dataDir}`);

  backendProcess = spawn(pythonExe, args, {
    cwd: backendDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: backendEnv,
  });

  backendProcess.stdout.pipe(logStream);
  backendProcess.stderr.pipe(logStream);

  backendProcess.stdout.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[backend] ${line}`);
  });

  backendProcess.stderr.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[backend] ${line}`);
  });

  backendStartTime = Date.now();

  backendProcess.on("exit", (code, signal) => {
    const uptimeSec = backendStartTime ? ((Date.now() - backendStartTime) / 1000).toFixed(1) : "unknown";
    console.log(
      `[electron] Backend exited: code=${code} signal=${signal} intentional=${intentionalStop} uptime=${uptimeSec}s`
    );
    backendProcess = null;
    notifyRendererBackendStatus("stopped");

    if (!intentionalStop && code !== 0) {
      const now = Date.now();
      if (now - lastCrashTime > AUTO_RESTART_COOLDOWN_MS * AUTO_RESTART_MAX_RETRIES) {
        autoRestartCount = 0;
      }
      lastCrashTime = now;

      if (autoRestartCount < AUTO_RESTART_MAX_RETRIES) {
        autoRestartCount++;
        console.log(`[electron] Auto-restarting backend (attempt ${autoRestartCount}/${AUTO_RESTART_MAX_RETRIES})...`);
        setTimeout(() => void startBackend(), AUTO_RESTART_COOLDOWN_MS);
      } else {
        console.error(`[electron] Backend crashed ${AUTO_RESTART_MAX_RETRIES} times, giving up auto-restart`);
        notifyRendererBackendStatus("crashed");
      }
    }
  });

  const ready = await waitForBackendReady(backendPort);
  if (!ready) {
    console.error(`[electron] Backend failed to start within ${HEALTH_CHECK_TIMEOUT_MS / 1000}s`);
    console.error(`[electron] Check log: ${logFile}`);
  } else {
    console.log(`[electron] Backend ready on http://${BACKEND_HOST}:${backendPort}`);
    notifyRendererBackendStatus("ready");
  }
  return ready;
}

function forceKillProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // process may have already exited
  }
}

function stopBackend() {
  if (!backendProcess) return;
  intentionalStop = true;
  const pid = backendProcess.pid;
  console.log(`[electron] Stopping backend (PID ${pid})...`);
  forceKillProcessTree(pid);
  backendProcess = null;
}

function killStaleBackendProcesses() {
  if (process.platform !== "win32") return;
  const pythonExe = resolvePythonExe();
  try {
    const wmicOut = execSync(
      `wmic process where "ExecutablePath='${pythonExe.replace(/\\/g, "\\\\")}' and CommandLine like '%start_backend%'" get ProcessId /format:list`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }
    );
    const pids = wmicOut.match(/ProcessId=(\d+)/g);
    if (pids) {
      for (const m of pids) {
        const stalePid = m.split("=")[1];
        console.log(`[electron] Killing stale backend process PID ${stalePid}`);
        forceKillProcessTree(parseInt(stalePid, 10));
      }
    }
  } catch {
    // wmic may fail on some systems, not critical
  }
}

function notifyRendererBackendStatus(status) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send("backend-status", status);
    } catch {
      // window may be closing
    }
  }
}

async function restartBackendProcess() {
  stopBackend();
  await new Promise((r) => setTimeout(r, 1000));
  intentionalStop = false;
  autoRestartCount = 0;
  return startBackend();
}

// ────────────────────────────────────────────
// Error handlers
// ────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[electron] uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[electron] unhandledRejection:", reason);
});

// ────────────────────────────────────────────
// IPC handlers — file operations (existing)
// ────────────────────────────────────────────
ipcMain.handle("open-import-dialog", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const res = await dialog.showOpenDialog(win, {
      title: "选择文件",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Supported", extensions: IMPORT_EXTENSIONS }],
    });
    const paths = Array.isArray(res.filePaths) ? res.filePaths : [];
    const entries = paths.map((p) => ({ path: p, isDirectory: false }));
    return { canceled: !!res.canceled, entries };
  } catch (err) {
    console.error("[electron] open-import-dialog failed:", err);
    return { canceled: true, entries: [] };
  }
});

ipcMain.handle("list-dir-images", async (_event, args) => {
  try {
    const dirPath = args && typeof args.dirPath === "string" ? args.dirPath : "";
    if (!dirPath) return { ok: false, files: [] };
    const files = listImagesRecursive(dirPath);
    return { ok: true, files };
  } catch (err) {
    console.error("[electron] list-dir-images failed:", err);
    return { ok: false, files: [] };
  }
});

ipcMain.handle("read-file", async (_event, args) => {
  try {
    const filePath = args && typeof args.filePath === "string" ? args.filePath : "";
    if (!filePath) return { ok: false };
    const data = fs.readFileSync(filePath);
    const name = path.basename(filePath);
    const mime = extToMime(path.extname(name));
    const base64 = data.toString("base64");
    return { ok: true, name, mime, base64 };
  } catch (err) {
    console.error("[electron] read-file failed:", err);
    return { ok: false };
  }
});

// ────────────────────────────────────────────
// IPC handlers — new desktop channels
// ────────────────────────────────────────────
ipcMain.handle("select-directory", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const res = await dialog.showOpenDialog(win, {
      title: "选择输出目录",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths.length) {
      return { canceled: true };
    }
    return { canceled: false, path: res.filePaths[0] };
  } catch (err) {
    console.error("[electron] select-directory failed:", err);
    return { canceled: true };
  }
});

ipcMain.handle("save-file-dialog", async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const dialogOpts = { title: "保存文件" };
    if (options?.defaultName) dialogOpts.defaultPath = options.defaultName;
    if (Array.isArray(options?.filters)) dialogOpts.filters = options.filters;
    const res = await dialog.showSaveDialog(win, dialogOpts);
    if (res.canceled || !res.filePath) return { canceled: true };
    return { canceled: false, path: res.filePath };
  } catch (err) {
    console.error("[electron] save-file-dialog failed:", err);
    return { canceled: true };
  }
});

ipcMain.handle("get-app-paths", async () => ({
  appDir: IS_PACKAGED ? path.dirname(app.getPath("exe")) : path.resolve(__dirname, ".."),
  dataDir: resolveDataDir(),
  extensionsDir: resolveExtensionsDir(),
  logsDir: resolveLogsDir(),
}));

ipcMain.handle("get-backend-url", async () => ({
  url: `http://${BACKEND_HOST}:${backendPort}`,
  port: backendPort,
  host: BACKEND_HOST,
}));

ipcMain.handle("relaunch-app", async () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle("restart-backend", async () => {
  try {
    const ok = await restartBackendProcess();
    return { ok };
  } catch (err) {
    console.error("[electron] restart-backend failed:", err);
    return { ok: false };
  }
});

ipcMain.handle("open-external", async (_event, args) => {
  const url = args && typeof args.url === "string" ? args.url : "";
  if (url) await shell.openExternal(url);
});

ipcMain.handle("open-path", async (_event, args) => {
  const targetPath = args && typeof args.path === "string" ? args.path : "";
  if (!targetPath) return;
  try {
    await shell.openPath(targetPath);
  } catch (err) {
    console.error("[electron] open-path failed:", err);
  }
});

ipcMain.handle("show-item-in-folder", async (_event, args) => {
  const filePath = args && typeof args.path === "string" ? args.path : "";
  if (!filePath) return;
  shell.showItemInFolder(filePath);
});

// ────────────────────────────────────────────
// IPC handlers — window controls
// ────────────────────────────────────────────
ipcMain.handle("window-minimize", async (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window-maximize", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.handle("window-close", async (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// ────────────────────────────────────────────
// IPC handlers — persistent data files
// ────────────────────────────────────────────
const ALLOWED_DATA_FILES = new Set(["library.json", "jobs.json"]);

ipcMain.handle("read-data-file", async (_event, args) => {
  const fileName = args && typeof args.fileName === "string" ? args.fileName : "";
  if (!fileName || !ALLOWED_DATA_FILES.has(fileName)) return { ok: false };

  const filePath = path.join(resolveDataDir(), fileName);
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return { ok: true, data };
  } catch {
    return { ok: true, data: null };
  }
});

ipcMain.handle("write-data-file", async (_event, args) => {
  const fileName = args && typeof args.fileName === "string" ? args.fileName : "";
  const data = args && typeof args.data === "string" ? args.data : "";
  if (!fileName || !ALLOWED_DATA_FILES.has(fileName)) return { ok: false };

  const dataDir = resolveDataDir();
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, fileName), data, "utf8");
    return { ok: true };
  } catch (err) {
    console.error(`[electron] write-data-file(${fileName}) failed:`, err);
    return { ok: false };
  }
});

// ────────────────────────────────────────────
// IPC handlers — blob file system storage
// ────────────────────────────────────────────
const BLOB_STORAGE_CONFIG = "blob_storage_path.txt";

function defaultBlobsDir() {
  if (IS_PACKAGED) {
    return path.join(path.dirname(app.getPath("exe")), "MangaTransData", "blobs");
  }
  return path.join(resolveDataDir(), "blobs");
}

function readBlobStorageConfig() {
  const cfgPath = path.join(resolveDataDir(), BLOB_STORAGE_CONFIG);
  try {
    const raw = fs.readFileSync(cfgPath, "utf8").trim();
    if (raw && fs.existsSync(raw)) return raw;
  } catch { /* ignore */ }
  return "";
}

function resolveBlobsDir() {
  const custom = readBlobStorageConfig();
  return custom || defaultBlobsDir();
}

function mimeToExt(mime) {
  const map = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/bmp": ".bmp", "image/gif": ".gif", "image/tiff": ".tiff" };
  return map[mime] || ".bin";
}

function deduplicateName(dir, baseName) {
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  let candidate = baseName;
  let i = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem}_${i}${ext}`;
    i++;
  }
  return candidate;
}

ipcMain.handle("write-blob", async (_event, args) => {
  const base64 = args && typeof args.base64 === "string" ? args.base64 : "";
  const mime = args && typeof args.mime === "string" ? args.mime : "";
  const dir = args && typeof args.dir === "string" ? args.dir : "";
  const name = args && typeof args.name === "string" ? args.name : "";
  if (!base64) return { ok: false, key: "" };

  const subDir = dir || "_misc";
  const targetDir = path.join(resolveBlobsDir(), subDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const fileName = name
    ? deduplicateName(targetDir, path.basename(name))
    : `${crypto.randomUUID()}${mimeToExt(mime)}`;

  const filePath = path.join(targetDir, fileName);
  try {
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    const relKey = path.join(subDir, fileName).replace(/\\/g, "/");
    return { ok: true, key: `fblob:${relKey}` };
  } catch (err) {
    console.error("[electron] write-blob failed:", err);
    return { ok: false, key: "" };
  }
});

ipcMain.handle("read-blob", async (_event, args) => {
  const key = args && typeof args.key === "string" ? args.key : "";
  if (!key) return { ok: false };

  const relPath = key.replace(/^fblob:/, "");
  const filePath = path.join(resolveBlobsDir(), relPath);
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_MAP[ext] || "application/octet-stream";
    return { ok: true, base64: buf.toString("base64"), mime };
  } catch (err) {
    console.error("[electron] read-blob failed:", key, err.message);
    return { ok: false };
  }
});

ipcMain.handle("delete-blob", async (_event, args) => {
  const key = args && typeof args.key === "string" ? args.key : "";
  if (!key) return { ok: false };

  const relPath = key.replace(/^fblob:/, "");
  const filePath = path.join(resolveBlobsDir(), relPath);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    console.error("[electron] delete-blob failed:", key, err.message);
    return { ok: false };
  }
});

ipcMain.handle("list-blob-keys", async () => {
  const blobsDir = resolveBlobsDir();
  if (!fs.existsSync(blobsDir)) return { ok: true, keys: [] };

  const keys = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const rel = path.relative(blobsDir, full).replace(/\\/g, "/");
        keys.push(`fblob:${rel}`);
      }
    }
  }
  try {
    walk(blobsDir);
  } catch (err) {
    console.error("[electron] list-blob-keys failed:", err);
  }
  return { ok: true, keys };
});

ipcMain.handle("resolve-blob-dir", async (_event, args) => {
  const dir = args && typeof args.dir === "string" ? args.dir : "";
  if (!dir) return { ok: false, path: "" };
  const absPath = path.join(resolveBlobsDir(), dir);
  return { ok: true, path: absPath };
});

ipcMain.handle("get-blob-storage-path", async () => {
  return { ok: true, path: resolveBlobsDir(), isCustom: !!readBlobStorageConfig() };
});

ipcMain.handle("set-blob-storage-path", async (_event, args) => {
  const newPath = args && typeof args.path === "string" ? args.path.trim() : "";
  const cfgPath = path.join(resolveDataDir(), BLOB_STORAGE_CONFIG);
  try {
    fs.mkdirSync(resolveDataDir(), { recursive: true });
    if (!newPath) {
      try { fs.unlinkSync(cfgPath); } catch { /* ignore */ }
    } else {
      fs.mkdirSync(newPath, { recursive: true });
      fs.writeFileSync(cfgPath, newPath, "utf8");
    }
    return { ok: true, path: resolveBlobsDir() };
  } catch (err) {
    console.error("[electron] set-blob-storage-path failed:", err);
    return { ok: false, path: resolveBlobsDir() };
  }
});

ipcMain.handle("select-blob-storage-dir", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "选择漫画存储位置",
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true, path: "" };
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle("set-title-bar-overlay", async (event, args) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  try {
    win.setTitleBarOverlay({
      color: args?.color || "#ffffff",
      symbolColor: args?.symbolColor || "#475569",
      height: args?.height || 40,
    });
  } catch (err) {
    console.error("[electron] set-title-bar-overlay failed:", err);
  }
});

ipcMain.handle("delete-old-blobs-dir", async () => {
  const oldDir = path.join(app.getPath("userData"), "data", "blobs");
  try {
    if (fs.existsSync(oldDir)) {
      fs.rmSync(oldDir, { recursive: true, force: true });
      return { ok: true, path: oldDir };
    }
    return { ok: true, path: "" };
  } catch (err) {
    console.error("[electron] delete-old-blobs-dir failed:", err);
    return { ok: false, path: oldDir };
  }
});

// ────────────────────────────────────────────
// Frontend (standalone Next.js) lifecycle
// ────────────────────────────────────────────
const FRONTEND_PORT_START = 3100;
const FRONTEND_PORT_END = 3110;
let frontendProcess = null;
let frontendPort = FRONTEND_PORT_START;

async function startFrontendServer() {
  frontendPort = await findAvailablePortInRange(FRONTEND_PORT_START, FRONTEND_PORT_END);
  console.log(`[electron] Starting frontend on port ${frontendPort}...`);

  const standaloneDir = path.join(process.resourcesPath, "standalone");
  const serverJs = path.join(standaloneDir, "server.js");

  if (!fs.existsSync(serverJs)) {
    console.error(`[electron] standalone server.js not found: ${serverJs}`);
    return false;
  }

  const {
    HTTP_PROXY, HTTPS_PROXY, http_proxy, https_proxy,
    ALL_PROXY, all_proxy,
    ...safeEnv
  } = process.env;

  frontendProcess = spawn(process.execPath, [serverJs], {
    cwd: standaloneDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...safeEnv,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(frontendPort),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NO_PROXY: "*",
      no_proxy: "*",
    },
  });

  frontendProcess.stdout.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[frontend] ${line}`);
  });
  frontendProcess.stderr.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[frontend] ${line}`);
  });
  frontendProcess.on("exit", (code) => {
    console.log(`[electron] Frontend exited: code=${code}`);
    frontendProcess = null;
  });

  const ready = await waitForReady(frontendPort, 15_000);
  if (!ready) {
    console.error("[electron] Frontend failed to start");
  } else {
    console.log(`[electron] Frontend ready on http://127.0.0.1:${frontendPort}`);
  }
  return ready;
}

function stopFrontend() {
  if (!frontendProcess) return;
  console.log("[electron] Stopping frontend...");
  try { frontendProcess.kill("SIGTERM"); } catch { /* ignore */ }
  frontendProcess = null;
}

async function findAvailablePortInRange(start, end) {
  for (let port = start; port <= end; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port in range ${start}-${end}`);
}

async function waitForReady(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get({ hostname: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
        res.resume();
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ────────────────────────────────────────────
// Window creation
// ────────────────────────────────────────────
const createWindow = async () => {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "rgba(0,0,0,0)",
      symbolColor: "#475569",
      height: 40,
    },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      defaultEncoding: "utf-8",
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[electron] blocked new-window attempt:", url);
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const allowed = url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost");
    if (!allowed) {
      event.preventDefault();
      console.warn("[electron] blocked navigation to:", url);
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[electron] did-fail-load:", { errorCode, errorDescription, validatedURL });
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[electron] render-process-gone:", details);
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // DevTools shortcut: F12 or Ctrl+Shift+I
  win.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
    // Ctrl+Shift+R: Force reload
    if (input.control && input.shift && input.key.toLowerCase() === "r") {
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });

  const baseUrl = IS_PACKAGED
    ? `http://127.0.0.1:${frontendPort}`
    : (process.env.NEXT_DEV_URL || "http://localhost:3000");
  const targetUrl = `${baseUrl}/`;

  console.log("[electron] loading:", targetUrl);
  try {
    await win.loadURL(targetUrl);
  } catch (err) {
    console.error("[electron] loadURL failed:", err);
    try {
      await win.loadURL(
        "data:text/html," +
          encodeURIComponent(
            `<html><body style="font-family:sans-serif;padding:40px;color:#ccc;background:#1a1a1a">` +
              `<h2>启动失败</h2>` +
              `<p>无法连接到前端服务: ${baseUrl}</p>` +
              (IS_PACKAGED ? `<p>前端服务启动失败，请尝试重启应用。</p>` : `<p>请确认 <code>npm run dev</code> 已启动。</p>`) +
              `</body></html>`
          )
      );
    } catch {
      // ignore
    }
    win.show();
  }
};

// ────────────────────────────────────────────
// App lifecycle
// ────────────────────────────────────────────
app.whenReady().then(async () => {
  ensureBundledModels();

  const skipBackend = process.env.MTS_SKIP_BACKEND === "1";

  // Start backend in background — don't block window creation
  if (!skipBackend) {
    startBackend().catch((err) => {
      console.error("[electron] Failed to start backend:", err);
    });
  } else {
    backendPort = parseInt(process.env.MTS_BACKEND_PORT || "8000", 10);
    process.env.MTS_BACKEND_PORT = String(backendPort);
    console.log(`[electron] Skipping backend start (MTS_SKIP_BACKEND=1), using port ${backendPort}`);
  }

  // In packaged mode, must wait for frontend server before loading URL
  if (IS_PACKAGED) {
    try {
      await startFrontendServer();
    } catch (err) {
      console.error("[electron] Failed to start frontend:", err);
    }
  }

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("before-quit", () => {
  stopFrontend();
  stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopFrontend();
    stopBackend();
    app.quit();
  }
});
