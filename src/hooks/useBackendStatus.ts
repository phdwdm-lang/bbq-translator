import { useCallback, useEffect, useRef, useState } from "react";
import { IS_ELECTRON, initBackendUrl, getBackendUrl } from "../lib/env";

export type BackendStatus = "connected" | "disconnected" | "crashed" | "restarting" | "starting";

const POLL_INTERVAL_NORMAL_MS = 10_000;
const POLL_INTERVAL_STARTUP_MS = 2_000;
const POLL_TIMEOUT_MS = 3_000;
const CONSECUTIVE_FAILURES_THRESHOLD_NORMAL = 2;
const CONSECUTIVE_FAILURES_THRESHOLD_TRANSLATING = 30;

let _isTranslating = false;
export function setGlobalTranslating(v: boolean) {
  _isTranslating = v;
}

let _lastKnownStatus: BackendStatus = "starting";

export function useBackendStatus() {
  const [status, _setStatus] = useState<BackendStatus>(_lastKnownStatus);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailures = useRef(0);
  const hasConnected = useRef(_lastKnownStatus === "connected");
  const pollingStarted = useRef(false);

  const setStatus = useCallback((v: BackendStatus | ((prev: BackendStatus) => BackendStatus)) => {
    _setStatus((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      _lastKnownStatus = next;
      return next;
    });
  }, []);

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
        const threshold = _isTranslating
          ? CONSECUTIVE_FAILURES_THRESHOLD_TRANSLATING
          : CONSECUTIVE_FAILURES_THRESHOLD_NORMAL;
        if (consecutiveFailures.current >= threshold) {
          setStatus((prev) => (prev === "crashed" || prev === "starting" || prev === "restarting") ? prev : "disconnected");
        }
      }
    } catch {
      consecutiveFailures.current++;
      const threshold = _isTranslating
        ? CONSECUTIVE_FAILURES_THRESHOLD_TRANSLATING
        : CONSECUTIVE_FAILURES_THRESHOLD_NORMAL;
      if (consecutiveFailures.current >= threshold) {
        setStatus((prev) => (prev === "crashed" || prev === "starting" || prev === "restarting") ? prev : "disconnected");
      }
    }
  }, []);

  const restart = useCallback(async () => {
    if (!IS_ELECTRON || !window.mts?.restartBackend) return;
    setStatus("restarting");
    consecutiveFailures.current = 0;
    try {
      const result = await window.mts.restartBackend();
      if (!result.ok) {
        setStatus((prev) => (prev === "connected" ? "connected" : "crashed"));
      }
    } catch {
      setStatus((prev) => (prev === "connected" ? "connected" : "crashed"));
    }
  }, []);

  const rebuildTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const interval = hasConnected.current ? POLL_INTERVAL_NORMAL_MS : POLL_INTERVAL_STARTUP_MS;
    timerRef.current = setInterval(() => void checkHealth(), interval);
  }, [checkHealth]);

  const startPolling = useCallback(async () => {
    if (pollingStarted.current) return;
    pollingStarted.current = true;
    if (IS_ELECTRON) {
      await initBackendUrl();
    }
    void checkHealth();
    rebuildTimer();
  }, [checkHealth, rebuildTimer]);

  useEffect(() => {
    if (IS_ELECTRON) {
      if (_lastKnownStatus !== "starting") {
        void startPolling();
      }
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    // Non-Electron (dev) mode: start polling immediately
    void startPolling();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startPolling]);

  useEffect(() => {
    if (!IS_ELECTRON || !window.mts?.onBackendStatus) return;
    const unsubscribe = window.mts.onBackendStatus((ipcStatus) => {
      if (ipcStatus === "crashed") setStatus("crashed");
      else if (ipcStatus === "stopped") setStatus((prev) => (prev === "restarting" ? "restarting" : "disconnected"));
      else if (ipcStatus === "ready") {
        setStatus("connected");
        void startPolling();
      }
    });
    return unsubscribe;
  }, [startPolling]);

  return { status, checkHealth, restart };
}
