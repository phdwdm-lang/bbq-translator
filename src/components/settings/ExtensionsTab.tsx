"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, UploadCloud } from "lucide-react";
import {
  installExtension,
  importExtensionZip,
  importExtensionWhl,
  restartBackend,
  listExtensions,
  uninstallExtension,
  type ExtensionItem,
} from "../../lib/translateClient";

interface ExtensionsTabProps {
  open: boolean;
  focusExtensionId?: string;
}

const formatBytes = (n?: number) => {
  const v = typeof n === "number" ? n : 0;
  if (v <= 0) return "-";
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (v >= GB) return `${(v / GB).toFixed(2)} GB`;
  return `${Math.max(0.1, v / MB).toFixed(0)} MB`;
};

const formatSpeed = (bps?: number) => {
  const v = typeof bps === "number" ? bps : 0;
  if (v <= 0) return "-";
  return `${(v / 1024 / 1024).toFixed(1)} MB/s`;
};

export function ExtensionsTab({ open, focusExtensionId }: ExtensionsTabProps) {
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [extensionsError, setExtensionsError] = useState("");
  const [importingId, setImportingId] = useState("");
  const [importError, setImportError] = useState("");
  const [actionId, setActionId] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importTargetIdRef = useRef("");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const refreshExtensions = async () => {
    setExtensionsLoading(true);
    setExtensionsError("");
    try {
      const items = await listExtensions();
      setExtensions(items);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setExtensionsError(message);
      setExtensions([]);
    } finally {
      setExtensionsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setExtensionsError("");
    setImportError("");
    setImportingId("");
    setActionId("");
    void refreshExtensions();
  }, [open]);

  const hasActiveTask = useMemo(() => extensions.some((ext) => ext.download_state === "downloading" || ext.download_state === "installing"), [extensions]);

  useEffect(() => {
    if (!open || !hasActiveTask) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refreshExtensions();
      if (!cancelled) timer = setTimeout(poll, 1500);
    };
    timer = setTimeout(poll, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, hasActiveTask]);

  useEffect(() => {
    if (!open || !focusExtensionId) return;
    const el = cardRefs.current[focusExtensionId];
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      // ignore
    }
  }, [open, focusExtensionId, extensions.length]);

  const openImportDialog = (id: string) => {
    importTargetIdRef.current = id;
    setImportError("");
    if (fileInputRef.current) {
      if (id === "cuda") {
        fileInputRef.current.accept = ".whl,.zip,.001,.002,.003,.004,.005";
        fileInputRef.current.multiple = true;
      } else {
        fileInputRef.current.accept = ".zip";
        fileInputRef.current.multiple = false;
      }
    }
    fileInputRef.current?.click();
  };

  const doInstall = async (id: string) => {
    setActionId(id);
    setExtensionsError("");
    try {
      await installExtension({ id });
      await refreshExtensions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setExtensionsError(message);
    } finally {
      setActionId("");
    }
  };

  const doRestart = async () => {
    try {
      if (typeof window !== "undefined" && window.mts?.relaunchApp) {
        await window.mts.relaunchApp();
      } else if (typeof window !== "undefined" && window.mts?.restartBackend) {
        await window.mts.restartBackend();
      } else {
        await restartBackend();
      }
    } catch {
      // Server may already be shutting down
    }
  };

  const doUninstall = async (id: string) => {
    setActionId(id);
    setExtensionsError("");
    try {
      await uninstallExtension({ id });
      await refreshExtensions();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setExtensionsError(message);
    } finally {
      setActionId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-800">拓展</div>
          <div className="text-xs text-slate-500 mt-1">模型/插件类功能会集中放在这里</div>
        </div>
        <button
          type="button"
          className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
          onClick={() => void refreshExtensions()}
          disabled={extensionsLoading}
        >
          <div className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${extensionsLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            刷新
          </div>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const fileList = e.target.files;
          const id = importTargetIdRef.current;
          if (!fileList || fileList.length === 0 || !id) {
            e.target.value = "";
            return;
          }
          const selectedFiles = Array.from(fileList);
          e.target.value = "";

          void (async () => {
            setImportingId(id);
            setImportError("");
            try {
              if (id === "cuda") {
                const files = selectedFiles;
                const isSingleZip = files.length === 1 && files[0].name.toLowerCase().endsWith(".zip");
                const isAllWhl = files.every((f) => f.name.toLowerCase().endsWith(".whl"));
                const isSplitZip = files.length > 1 && files.every((f) => /\.zip\.\d{3}$/i.test(f.name));
                if (!isSingleZip && !isAllWhl && !isSplitZip) {
                  throw new Error("CUDA 扩展支持上传单个 .zip 压缩包、多个 .whl 文件或分卷 .zip 文件（.zip.001, .zip.002）");
                }
                await importExtensionWhl({ id, files });
              } else {
                const f = selectedFiles[0];
                if (!f.name.toLowerCase().endsWith(".zip")) {
                  throw new Error("仅支持 .zip 离线包");
                }
                await importExtensionZip({ id, file: f });
              }
              await refreshExtensions();
            } catch (err: unknown) {
              let message = err instanceof Error ? err.message : String(err ?? "Failed");
              if (message.includes("wheel_version_mismatch:")) {
                const parts = message.split(":");
                const filename = parts[1] || "";
                const reason = parts.slice(2).join(":") || "Python 版本不匹配";
                message = `文件 ${filename} 不兼容：${reason}。请下载 Python 3.11 版本的 wheel 文件（文件名包含 cp311）`;
              } else if (message.includes("not a supported wheel")) {
                message = "wheel 文件与当前 Python 版本不兼容。本软件使用 Python 3.11，请下载文件名包含 cp311 的 wheel 文件";
              }
              setImportError(message);
            } finally {
              setImportingId("");
              importTargetIdRef.current = "";
            }
          })();
        }}
      />

      {extensionsError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{extensionsError}</div>}
      {importError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{importError}</div>}

      <div className="space-y-3">
        {extensions.map((ext) => {
          const downloading = ext.download_state === "downloading";
          const installing = ext.download_state === "installing";
          const working = downloading || installing;
          const done = ext.download_state === "done";
          const totalBytes = typeof ext.total_bytes === "number" ? ext.total_bytes : 0;
          const downloadedBytes = typeof ext.downloaded_bytes === "number" ? ext.downloaded_bytes : 0;
          const hasProgress = totalBytes > 0 && downloadedBytes >= 0;
          const percent = hasProgress ? Math.max(0, Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100))) : 0;
          const busy = actionId === ext.id || importingId === ext.id || working;
          const phaseLabel = ext.phase === "reverting_to_cpu" ? "\u5378\u8f7d\u4e2d" : ext.phase === "caching_cpu" ? "\u7f13\u5b58 CPU \u7248\u672c\u4e2d" : ext.phase === "installing" ? "\u5b89\u88c5\u4e2d" : ext.phase === "downloading" ? "\u4e0b\u8f7d\u4e2d" : "";
          const statusText = working ? (phaseLabel || "处理中") : ext.installed ? "已安装" : done ? "已就绪" : "未安装";

          return (
            <div
              key={ext.id}
              ref={(el) => {
                cardRefs.current[ext.id] = el;
              }}
              className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800">{ext.name}</div>
                  {ext.description && <div className="text-[10px] text-slate-500 mt-1">{ext.description}</div>}
                  <div className="text-[10px] text-slate-500 mt-1">体积：{formatBytes(ext.size_bytes)}</div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {!ext.installed && !working && (
                    <>
                      <button
                        type="button"
                        className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                        onClick={() => openImportDialog(ext.id)}
                        disabled={busy}
                      >
                        <div className="flex items-center gap-2">
                          <UploadCloud className="h-4 w-4" aria-hidden="true" />
                          离线导入
                        </div>
                      </button>
                    </>
                  )}

                  {working && (
                    <button
                      type="button"
                      className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                      disabled
                    >
                      {phaseLabel || "处理中…"}
                    </button>
                  )}

                  {ext.installed && !working && (
                    <>
                      <button
                        type="button"
                        className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                        onClick={() => openImportDialog(ext.id)}
                        disabled={busy}
                      >
                        <div className="flex items-center gap-2">
                          <UploadCloud className="h-4 w-4" aria-hidden="true" />
                          离线导入
                        </div>
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
                        onClick={() => void doUninstall(ext.id)}
                        disabled={busy}
                      >
                        删除
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400">状态</div>
                  <div className="text-xs font-bold text-slate-800 mt-1">{statusText}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400">安装位置</div>
                  <div className="text-[10px] font-bold text-slate-600 mt-1 break-all">{ext.install_location || "-"}</div>
                </div>
              </div>

              {working && hasProgress && (
                <div className="mt-3">
                  <div className="text-[10px] text-slate-500">进度：{percent}%</div>
                  <div className="mt-2 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">
                    速度：{formatSpeed(ext.speed_bps)}
                    {hasProgress ? ` · ${formatBytes(downloadedBytes)}/${formatBytes(totalBytes)}` : ""}
                  </div>
                </div>
              )}

              {working && !hasProgress && (
                <div className="mt-3 text-xs text-slate-500 inline-flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {phaseLabel || "处理中"}…
                </div>
              )}

              {ext.download_error && !ext.installed && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{ext.download_error}</div>
              )}

              {(ext.restart_required || ext.restart_recommended) && ext.installed && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
                  <div className="text-xs text-amber-600">
                    {ext.restart_reason || "安装完成后建议重启"}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors"
                    onClick={() => void doRestart()}
                  >
                    立即重启
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {importingId && (
          <div className="text-xs text-slate-500 inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            正在导入…
          </div>
        )}
      </div>
    </div>
  );
}
