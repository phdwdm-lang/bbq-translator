"use client";

import { RefreshCw, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { useBackendStatus, type BackendStatus } from "../../hooks/useBackendStatus";

const STATUS_CONFIG: Record<BackendStatus, { icon: typeof Wifi; label: string; color: string; bg: string }> = {
  connected: { icon: Wifi, label: "后端已连接", color: "text-green-600", bg: "bg-green-50" },
  starting: { icon: RefreshCw, label: "后端启动中…", color: "text-blue-600", bg: "bg-blue-50" },
  disconnected: { icon: WifiOff, label: "后端未连接", color: "text-amber-600", bg: "bg-amber-50" },
  crashed: { icon: AlertTriangle, label: "后端已崩溃", color: "text-red-600", bg: "bg-red-50" },
  restarting: { icon: RefreshCw, label: "重启中…", color: "text-blue-600", bg: "bg-blue-50" },
};

export function BackendStatusBar() {
  const { status, restart } = useBackendStatus();

  if (status === "connected") return null;

  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const isSpinning = status === "restarting" || status === "starting";
  const canRestart = status === "crashed" || status === "disconnected";

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 ${cfg.bg} border-b border-slate-200`}>
      <div className={`flex items-center gap-2 text-xs font-bold ${cfg.color}`}>
        <Icon className={`h-4 w-4 ${isSpinning ? "animate-spin" : ""}`} aria-hidden="true" />
        {cfg.label}
      </div>
      {canRestart && (
        <button
          type="button"
          className="px-3 py-1 bg-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          onClick={() => void restart()}
        >
          重启后端
        </button>
      )}
    </div>
  );
}
