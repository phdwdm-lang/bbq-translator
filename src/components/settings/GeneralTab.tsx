"use client";

import { useEffect, useState } from "react";
import { FolderOpen, RotateCcw, FileDown } from "lucide-react";
import { getBackendUrl } from "../../lib/env";
import { collectAllReferencedBlobKeys, getLocalStorageUsage } from "../../lib/storage";
import { cleanOrphanBlobs, listAllBlobKeys } from "../../lib/blobDb";

interface StorageStats {
  total: number;
  orphan: number;
  deleted: number;
  localStorageUsed?: number;
  librarySize?: number;
}

function useStoragePath() {
  const [storagePath, setStoragePath] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [pathLoading, setPathLoading] = useState(false);

  const refresh = async () => {
    const mts = window.mts;
    if (!mts) return;
    const res = await mts.getBlobStoragePath();
    if (res.ok) {
      setStoragePath(res.path);
      setIsCustom(res.isCustom);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const selectFolder = async () => {
    const mts = window.mts;
    if (!mts) return;
    const result = await mts.selectBlobStorageDir();
    if (result.canceled || !result.path) return;
    setPathLoading(true);
    const res = await mts.setBlobStoragePath(result.path);
    if (res.ok) {
      setStoragePath(res.path);
      setIsCustom(true);
    }
    setPathLoading(false);
  };

  const resetDefault = async () => {
    const mts = window.mts;
    if (!mts) return;
    setPathLoading(true);
    const res = await mts.setBlobStoragePath("");
    if (res.ok) {
      setStoragePath(res.path);
      setIsCustom(false);
    }
    setPathLoading(false);
  };

  const openFolder = async () => {
    const mts = window.mts;
    if (!mts || !storagePath) return;
    await mts.openPath(storagePath);
  };

  return { storagePath, isCustom, pathLoading, selectFolder, resetDefault, openFolder };
}

function useExportLogs() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportDone, setExportDone] = useState(false);

  const exportLogs = async () => {
    setExporting(true);
    setExportError("");
    setExportDone(false);
    try {
      const res = await fetch(`${getBackendUrl()}/export_logs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || `bbq-diagnostic-${Date.now()}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportDone(true);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : String(err ?? "Failed"));
    } finally {
      setExporting(false);
    }
  };

  return { exporting, exportError, exportDone, exportLogs };
}

export function GeneralTab() {
  const [storageCleaning, setStorageCleaning] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [storageError, setStorageError] = useState("");
  const { exporting, exportError, exportDone, exportLogs } = useExportLogs();

  const { storagePath, isCustom, pathLoading, selectFolder, resetDefault, openFolder } = useStoragePath();

  const scanStorage = async () => {
    setStorageCleaning(true);
    setStorageError("");
    setStorageStats(null);
    try {
      const allKeys = await listAllBlobKeys();
      const referencedKeys = collectAllReferencedBlobKeys();
      const orphanCount = allKeys.filter((k) => !referencedKeys.has(k)).length;
      const { used, librarySize } = getLocalStorageUsage();
      setStorageStats({ total: allKeys.length, orphan: orphanCount, deleted: 0, localStorageUsed: used, librarySize });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setStorageError(message);
    } finally {
      setStorageCleaning(false);
    }
  };

  const cleanOrphans = async () => {
    if (!storageStats || storageStats.orphan === 0) return;
    setStorageCleaning(true);
    setStorageError("");
    try {
      const referencedKeys = collectAllReferencedBlobKeys();
      const deleted = await cleanOrphanBlobs(referencedKeys);
      const allKeys = await listAllBlobKeys();
      setStorageStats({ total: allKeys.length, orphan: 0, deleted });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setStorageError(message);
    } finally {
      setStorageCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Storage Location */}
      {window.mts && (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-bold text-slate-800">漫画存储位置</div>
            <div className="text-xs text-slate-500 mt-1">设置漫画图片文件的本地存储路径</div>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 truncate font-mono" title={storagePath}>
                {storagePath || "加载中..."}
              </div>
              <button
                type="button"
                className="p-2 text-slate-500 hover:bg-white hover:text-indigo-600 rounded-lg transition-colors shrink-0"
                onClick={() => void openFolder()}
                title="打开文件夹"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
                disabled={pathLoading}
                onClick={() => void selectFolder()}
              >
                更改路径
              </button>
              {isCustom && (
                <button
                  type="button"
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  disabled={pathLoading}
                  onClick={() => void resetDefault()}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  恢复默认
                </button>
              )}
            </div>

            {isCustom && (
              <div className="text-[10px] text-amber-600">当前使用自定义路径。更改路径后，需手动迁移已有图片文件。</div>
            )}
          </div>
        </div>
      )}

      {/* Orphan Storage Cleanup */}
      <div className="space-y-3">
        <div>
          <div className="text-sm font-bold text-slate-800">存储管理</div>
          <div className="text-xs text-slate-500 mt-1">清理本地存储中的孤儿数据（未被引用的图片缓存）</div>
        </div>

        {storageError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{storageError}</div>}

        {storageStats && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
            <div className="text-xs text-slate-600">
              图片数量：<span className="font-bold text-slate-800">{storageStats.total}</span>
            </div>
            <div className="text-xs text-slate-600">
              孤儿数据：
              <span className={`font-bold ${storageStats.orphan > 0 ? "text-amber-600" : "text-slate-800"}`}>{storageStats.orphan}</span>
            </div>
            {storageStats.localStorageUsed !== undefined && (
              <div className="text-xs text-slate-600">
                localStorage：
                <span className={`font-bold ${storageStats.localStorageUsed > 4 * 1024 * 1024 ? "text-red-600" : "text-slate-800"}`}>
                  {(storageStats.localStorageUsed / 1024).toFixed(1)} KB
                </span>
                {storageStats.librarySize !== undefined && (
                  <span className="text-slate-400"> （书库 {(storageStats.librarySize / 1024).toFixed(1)} KB）</span>
                )}
              </div>
            )}
            {storageStats.deleted > 0 && (
              <div className="text-xs text-green-600 font-bold">已清理 {storageStats.deleted} 个孤儿数据</div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
            disabled={storageCleaning}
            onClick={() => void scanStorage()}
          >
            {storageCleaning ? "扫描中..." : "扫描存储"}
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
            disabled={storageCleaning || !storageStats || storageStats.orphan === 0}
            onClick={() => void cleanOrphans()}
          >
            清理孤儿数据
          </button>
        </div>
      </div>

      {/* Export Diagnostic Logs */}
      <div className="space-y-3">
        <div>
          <div className="text-sm font-bold text-slate-800">诊断日志</div>
          <div className="text-xs text-slate-500 mt-1">导出后端运行日志与系统环境信息，方便反馈问题时附带</div>
        </div>

        {exportError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{exportError}</div>}
        {exportDone && <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-600">日志已导出，请在下载目录查看</div>}

        <button
          type="button"
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
          disabled={exporting}
          onClick={() => void exportLogs()}
        >
          <FileDown className="w-3.5 h-3.5" />
          {exporting ? "导出中..." : "导出诊断日志"}
        </button>
      </div>
    </div>
  );
}
