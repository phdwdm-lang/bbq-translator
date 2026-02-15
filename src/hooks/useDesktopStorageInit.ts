import { useEffect, useState } from "react";
import { IS_ELECTRON } from "../lib/env";
import { initDesktopStorage } from "../lib/desktopStorage";
import { notifyMitChange } from "../lib/storage";

export function useDesktopStorageInit() {
  const [ready, setReady] = useState(!IS_ELECTRON);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    let cancelled = false;
    initDesktopStorage()
      .then(() => {
        if (cancelled) return;
        notifyMitChange();
        setReady(true);
      })
      .catch((err) => {
        console.error("[desktopStorage] init failed:", err);
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
