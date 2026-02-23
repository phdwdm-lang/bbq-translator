import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mts_sidebar_collapsed";
const AUTO_COLLAPSE_BREAKPOINT = 1280;

let _cachedCollapsed: boolean | null = null;
let _initialized = false;

export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (_cachedCollapsed !== null) return _cachedCollapsed;
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [autoCollapsed, setAutoCollapsed] = useState(false);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      _cachedCollapsed = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia(`(max-width: ${AUTO_COLLAPSE_BREAKPOINT - 1}px)`);

    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setAutoCollapsed(true);
        setCollapsed(true);
        _cachedCollapsed = true;
      } else {
        setAutoCollapsed(false);
        try {
          const stored = window.localStorage.getItem(STORAGE_KEY);
          const val = stored === "1";
          setCollapsed(val);
          _cachedCollapsed = val;
        } catch {
          setCollapsed(false);
          _cachedCollapsed = false;
        }
      }
    };

    if (!_initialized) {
      _initialized = true;
      handler(mql);
    }
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return { collapsed, toggle, autoCollapsed };
}
