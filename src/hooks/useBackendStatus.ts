import { useCallback, useEffect, useRef, useState } from "react";
import { IS_ELECTRON, initBackendUrl, getBackendUrl } from "../lib/env";

export type BackendStatus = "connected" | "disconnected" | "crashed" | "restarting" | "starting";

const POLL_INTERVAL_NORMAL_MS = 10_000;
const POLL_INTERVAL_STARTUP_MS = 2_000;
const POLL_TIMEOUT_MS = 3_000;
const CONSECUTIVE_FAILURES_THRESHOLD = 2;

export function useBackendStatus() {
  const [status, setStatus] = useState<BackendStatus>("starting");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailures = useRef(0);
  const hasConnected = useRef(false);

  const checkHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
      const res = await fetch(`${getBackendUrl()}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        consecutiveFailures.current = 0;
        if (!hasConnected.current) {
          hasConnected.current = true;
          rebuildTimer();
        }
        setStatus("connected");
      } else {
        consecutiveFailures.current++;
        if (consecutiveFailures.current >= CONSECUTIVE_FAILURES_THRESHOLD) {
          setStatus((prev) => (prev === "crashed" ? "crashed" : prev === "starting" ? "starting" : "disconnected"));
        }
      }
    } catch {
      consecutiveFailures.current++;
      if (consecutiveFailures.current >= CONSECUTIVE_FAILURES_THRESHOLD) {
        setStatus((prev) => (prev === "crashed" ? "crashed" : prev === "starting" ? "starting" : "disconnected"));
      }
    }
  }, []);

  const restart = useCallback(async () => {
    if (!IS_ELECTRON || !window.mts?.restartBackend) return;
    setStatus("restarting");
    try {
      const result = await window.mts.restartBackend();
      if (result.ok) {
        setStatus("connected");
      } else {
        setStatus("crashed");
      }
    } catch {
      setStatus("crashed");
    }
  }, []);

  const rebuildTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const interval = hasConnected.current ? POLL_INTERVAL_NORMAL_MS : POLL_INTERVAL_STARTUP_MS;
    timerRef.current = setInterval(() => void checkHealth(), interval);
  }, [checkHealth]);

  useEffect(() => {
    // Initialize backend URL first (fetches dynamic port in Electron packaged mode)
    const init = async () => {
      if (IS_ELECTRON) {
        await initBackendUrl();
      }
      void checkHealth();
      rebuildTimer();
    };
    void init();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [checkHealth, rebuildTimer]);

  useEffect(() => {
    if (!IS_ELECTRON || !window.mts?.onBackendStatus) return;
    const unsubscribe = window.mts.onBackendStatus((ipcStatus) => {
      if (ipcStatus === "crashed") setStatus("crashed");
      else if (ipcStatus === "stopped") setStatus("disconnected");
      else if (ipcStatus === "ready") setStatus("connected");
    });
    return unsubscribe;
  }, []);

  return { status, checkHealth, restart };
}
