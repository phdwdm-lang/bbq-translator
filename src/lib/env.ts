import type { ElectronMts } from "@/types/electron";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

function resolveElectronMts(): ElectronMts | undefined {
  if (typeof window === "undefined") return undefined;
  return window.mts;
}

function resolveBackendUrl(): string {
  const mts = resolveElectronMts();
  if (mts?.backendUrl) return mts.backendUrl;
  return process.env.NEXT_PUBLIC_API_BASE || DEFAULT_BACKEND_URL;
}

export const IS_ELECTRON =
  typeof window !== "undefined" && !!window.mts;

export const API_BASE = resolveBackendUrl();
