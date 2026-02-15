export type BlobRecord = {
  key: string;
  blob: Blob;
  createdAt: number;
};

const FBLOB_PREFIX = "fblob:";

const IS_ELECTRON = typeof window !== "undefined" && !!window.mts;

// ────────────────────────────────────────────
// IndexedDB backend (web fallback)
// ────────────────────────────────────────────
const DB_NAME = "mit-db";
const DB_VERSION = 1;
const STORE_NAME = "blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(blob: Blob): Promise<string> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const key = crypto.randomUUID();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({ key, blob, createdAt: Date.now() } as BlobRecord);
        tx.oncomplete = () => { db.close(); resolve(key); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      }),
  );
}

function idbGet(key: string): Promise<Blob | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve((req.result as BlobRecord | undefined)?.blob ?? null);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => { db.close(); reject(tx.error); };
      }),
  );
}

function idbDelete(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      }),
  );
}

function idbListKeys(): Promise<string[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => { db.close(); reject(tx.error); };
      }),
  );
}

// ────────────────────────────────────────────
// File system backend (Electron)
// ────────────────────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function fsPut(blob: Blob, dir?: string, name?: string): Promise<string> {
  const mts = window.mts!;
  const base64 = await blobToBase64(blob);
  const result = await mts.writeBlob(base64, blob.type, dir, name);
  if (!result.ok) throw new Error("write-blob IPC failed");
  return result.key;
}

async function fsGet(key: string): Promise<Blob | null> {
  const mts = window.mts!;
  const result = await mts.readBlob(key);
  if (!result.ok || !result.base64 || !result.mime) return null;
  return base64ToBlob(result.base64, result.mime);
}

async function fsDelete(key: string): Promise<void> {
  const mts = window.mts!;
  await mts.deleteBlob(key);
}

async function fsListKeys(): Promise<string[]> {
  const mts = window.mts!;
  const result = await mts.listBlobKeys();
  return result.ok ? result.keys : [];
}

// ────────────────────────────────────────────
// Public API — auto-routes by environment & key prefix
// ────────────────────────────────────────────
export interface PutBlobOpts {
  dir?: string;
  name?: string;
}

export async function putBlob(blob: Blob, opts?: PutBlobOpts): Promise<string> {
  if (IS_ELECTRON) return fsPut(blob, opts?.dir, opts?.name);
  return idbPut(blob);
}

export async function getBlob(key: string): Promise<Blob | null> {
  if (key.startsWith(FBLOB_PREFIX)) return fsGet(key);
  return idbGet(key);
}

export async function deleteBlob(key: string): Promise<void> {
  if (key.startsWith(FBLOB_PREFIX)) return fsDelete(key);
  return idbDelete(key);
}

export async function blobExists(key: string): Promise<boolean> {
  try {
    const blob = await getBlob(key);
    return blob !== null;
  } catch {
    return false;
  }
}

export async function listAllBlobKeys(): Promise<string[]> {
  if (IS_ELECTRON) {
    const fsKeys = await fsListKeys();
    const idbKeys = await idbListKeys().catch(() => [] as string[]);
    return [...fsKeys, ...idbKeys];
  }
  return idbListKeys();
}

export async function cleanOrphanBlobs(referencedKeys: Set<string>): Promise<number> {
  const allKeys = await listAllBlobKeys();
  let deleted = 0;

  for (const key of allKeys) {
    if (!referencedKeys.has(key)) {
      try {
        await deleteBlob(key);
        deleted++;
      } catch {
        // ignore individual deletion errors
      }
    }
  }

  return deleted;
}

export function isFileBlobKey(key: string): boolean {
  return key.startsWith(FBLOB_PREFIX);
}

export function extractBlobDir(key: string): string | null {
  if (!key.startsWith(FBLOB_PREFIX)) return null;
  const rel = key.slice(FBLOB_PREFIX.length);
  const lastSlash = rel.lastIndexOf("/");
  return lastSlash > 0 ? rel.slice(0, lastSlash) : null;
}
