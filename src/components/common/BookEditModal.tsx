"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createBook, renameBook } from "../../lib/storage";

export type BookEditModalMode = "create" | "edit";

export interface BookEditModalProps {
  mode: BookEditModalMode;
  open: boolean;
  onClose: () => void;
  bookId?: string;
  initialTitle?: string;
  initialDescription?: string;
}

const TITLE_MAX_LENGTH = 20;
const DESCRIPTION_MAX_LENGTH = 200;

export function BookEditModal({ mode, open, onClose, bookId, initialTitle = "", initialDescription = "" }: BookEditModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setDescription(initialDescription);
      setError("");
      setSaving(false);
    }
  }, [open, initialTitle, initialDescription]);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError("请输入书籍名称"); return; }
    if (trimmedTitle.length > TITLE_MAX_LENGTH) { setError(`书籍名称不能超过 ${TITLE_MAX_LENGTH} 个字符`); return; }

    setSaving(true);
    try {
      if (mode === "create") {
        createBook(trimmedTitle, { description: description.trim() || undefined });
      } else if (bookId) {
        renameBook({ bookId, title: trimmedTitle, description: description.trim() || undefined });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err ?? "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const isCreate = mode === "create";
  const modalTitle = isCreate ? "创建书籍" : "编辑书籍";
  const confirmLabel = isCreate ? "确认创建" : "保存修改";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h3 className="text-lg font-bold text-slate-800">{modalTitle}</h3>
          <button type="button" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">书籍名称</label>
            <input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSave(); } }}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="请输入书籍名称（20字以内）"
              maxLength={TITLE_MAX_LENGTH}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              书籍介绍<span className="text-slate-400 font-normal ml-1">（选填）</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
              placeholder="简要介绍这本书的内容"
              rows={3}
              maxLength={DESCRIPTION_MAX_LENGTH}
            />
            <div className="text-right mt-1">
              <span className={`text-[11px] ${description.length >= DESCRIPTION_MAX_LENGTH ? "text-red-400" : "text-slate-300"}`}>
                {description.length}/{DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => void handleSave()}
            disabled={saving || !title.trim()}
          >
            {saving ? "保存中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
