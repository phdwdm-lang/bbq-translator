import type { ElectronMts } from "@/types/electron";

const DATA_FILE_MAP: Record<string, string> = {
  "mit.library.v1": "library.json",
  "mit.jobs.v1": "jobs.json",
};

const cache = new Map<string, string>();
let initialized = false;

function getMts(): ElectronMts | undefined {
  if (typeof window === "undefined") return undefined;
  return window.mts;
}

export async function initDesktopStorage(): Promise<void> {
  if (initialized) return;
  const mts = getMts();
  if (!mts) return;

  for (const [key, fileName] of Object.entries(DATA_FILE_MAP)) {
    try {
      const result = await mts.readDataFile(fileName);
      if (result.ok && result.data) {
        cache.set(key, result.data);
      }
    } catch {
      // file may not exist yet
    }
  }

  initialized = true;
}

export function getItem(key: string): string | null {
  return cache.get(key) ?? null;
}

export function setItem(key: string, value: string): void {
  cache.set(key, value);

  const fileName = DATA_FILE_MAP[key];
  if (!fileName) return;

  const mts = getMts();
  if (!mts) return;

  mts.writeDataFile(fileName, value).catch((err) => {
    console.error(`[desktopStorage] Failed to persist ${fileName}:`, err);
  });
}

export function removeItem(key: string): void {
  cache.delete(key);
}

export function isInitialized(): boolean {
  return initialized;
}
