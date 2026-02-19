import type { ElectronMts } from "@/types/electron";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

function resolveElectronMts(): ElectronMts | undefined {
  if (typeof window === "undefined") return undefined;
  return window.mts;
}

// Cached backend URL - updated by initBackendUrl()
let cachedBackendUrl: string | null = null;

function resolveBackendUrl(): string {
  // Use cached value if available
  if (cachedBackendUrl) return cachedBackendUrl;
  
  const mts = resolveElectronMts();
  if (mts?.backendUrl) return mts.backendUrl;
  return process.env.NEXT_PUBLIC_API_BASE || DEFAULT_BACKEND_URL;
}

/**
 * Initialize backend URL by fetching it from Electron main process.
 * This should be called early in the app lifecycle (e.g., in a useEffect).
 * In packaged mode, this fetches the dynamically assigned port.
 */
export async function initBackendUrl(): Promise<string> {
  const mts = resolveElectronMts();
  if (mts?.getBackendUrl) {
    try {
      const url = await mts.getBackendUrl();
      if (url) {
        cachedBackendUrl = url;
        return url;
      }
    } catch (e) {
      console.error("[env] Failed to get backend URL:", e);
    }
  }
  return resolveBackendUrl();
}

/**
 * Get current backend URL. Call initBackendUrl() first in Electron mode.
 */
export function getBackendUrl(): string {
  return cachedBackendUrl || resolveBackendUrl();
}

export const IS_ELECTRON =
  typeof window !== "undefined" && !!window.mts;

// For backwards compatibility - use getBackendUrl() for dynamic access
export const API_BASE = resolveBackendUrl();
