"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { API_BASE } from "../../lib/env";

interface FontItem {
  name: string;
  filename: string;
  path: string;
  is_custom: boolean;
}

export function FontsTab({ open }: { open: boolean }) {
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontsError, setFontsError] = useState("");
  const [fontUploading, setFontUploading] = useState(false);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  const refreshFonts = async () => {
    setFontsLoading(true);
    setFontsError("");
    try {
      const res = await fetch(`${API_BASE}/fonts/list`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFonts(data.fonts || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setFontsError(message);
      setFonts([]);
    } finally {
      setFontsLoading(false);
    }
  };

  const uploadFont = async (file: File) => {
    setFontUploading(true);
    setFontsError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/fonts/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      await refreshFonts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setFontsError(message);
    } finally {
      setFontUploading(false);
    }
  };

  const deleteFont = async (filename: string) => {
    setFontsError("");
    try {
      const res = await fetch(`${API_BASE}/fonts/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      await refreshFonts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setFontsError(message);
    }
  };

  useEffect(() => {
    if (!open) return;
    void refreshFonts();
  }, [open]);

  const builtinFonts = fonts.filter((f) => !f.is_custom);
  const customFonts = fonts.filter((f) => f.is_custom);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-800">字体管理</div>
          <div className="text-xs text-slate-500 mt-1">上传自定义字体，用于翻译渲染和编辑器</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
            onClick={() => fontInputRef.current?.click()}
            disabled={fontUploading}
          >
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              上传字体
            </div>
          </button>
          <button
            type="button"
            className="px-3 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
            onClick={() => void refreshFonts()}
            disabled={fontsLoading}
          >
            <div className="flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${fontsLoading ? "animate-spin" : ""}`} aria-hidden="true" />
              刷新
            </div>
          </button>
        </div>
      </div>

      <input
        ref={fontInputRef}
        type="file"
        accept=".ttf,.otf,.ttc"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          e.target.value = "";
          if (!f) return;
          void uploadFont(f);
        }}
      />

      {fontsError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{fontsError}</div>}

      {fontUploading && (
        <div className="text-xs text-slate-500 inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在上传…
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">内置字体</div>
        {builtinFonts.map((font) => (
          <div
            key={font.filename}
            className="bg-white border border-slate-100 rounded-xl p-3 flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-bold text-slate-800">{font.name}</div>
              <div className="text-[10px] text-slate-400">{font.filename}</div>
            </div>
            <div className="text-[10px] text-slate-400">内置</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">自定义字体</div>
        {customFonts.length === 0 ? (
          <div className="text-xs text-slate-400">暂无自定义字体</div>
        ) : (
          customFonts.map((font) => (
            <div
              key={font.filename}
              className="bg-white border border-slate-100 rounded-xl p-3 flex items-center justify-between"
            >
              <div>
                <div className="text-xs font-bold text-slate-800">{font.name}</div>
                <div className="text-[10px] text-slate-400">{font.filename}</div>
              </div>
              <button
                type="button"
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                onClick={() => void deleteFont(font.filename)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
        <div className="text-[10px] text-slate-400">支持格式：.ttf, .otf, .ttc</div>
      </div>
    </div>
  );
}
