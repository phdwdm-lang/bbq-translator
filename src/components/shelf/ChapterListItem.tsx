"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MoreHorizontal, Languages, Pencil, FolderOpen, Trash2 } from "lucide-react";

export type ChapterListItemProps = {
  itemKey: string;
  title: string;
  href: string;
  coverUrl?: string;
  isRaw: boolean;
  pageCount: number;
  dateLabel: string;
  batchMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onNavigate: () => void;
  onShowPreview: (el: HTMLElement) => void;
  onHidePreview: () => void;
  onTranslate?: () => void;
  onRename?: () => void;
  onOpenFolder?: () => void;
  onDelete?: () => void;
};

export function ChapterListItem({
  title,
  coverUrl,
  isRaw,
  pageCount,
  dateLabel,
  batchMode,
  selected,
  onToggleSelect,
  onNavigate,
  onShowPreview,
  onHidePreview,
  onTranslate,
  onRename,
  onOpenFolder,
  onDelete,
}: ChapterListItemProps) {
  const kindBadgeClass = isRaw
    ? "bg-orange-50 text-orange-600"
    : "bg-indigo-50 text-indigo-600";
  const kindLabel = isRaw ? "生肉" : "熟肉";
  const borderClass = isRaw ? "border-orange-200" : "border-indigo-200";

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const hasMenuItems = !!(onTranslate && isRaw) || !!onRename || !!onOpenFolder || !!onDelete;

  const openMenu = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldDropUp = spaceBelow < 220;
    setMenuPos({
      top: shouldDropUp ? rect.top : rect.bottom + 4,
      left: rect.right,
      dropUp: shouldDropUp,
    });
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const inMenu = menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target);
      const inTrigger = triggerRef.current && e.target instanceof Node && triggerRef.current.contains(e.target);
      if (!inMenu && !inTrigger) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const handleRowClick = () => {
    if (batchMode) {
      onToggleSelect();
    } else {
      onNavigate();
    }
  };

  const dropdownMenu = menuOpen && typeof document !== "undefined" && createPortal(
    <div
      ref={menuRef}
      className="w-40 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-[9999]"
      style={{
        position: "fixed",
        left: menuPos.left,
        ...(menuPos.dropUp
          ? { bottom: window.innerHeight - menuPos.top + 4 }
          : { top: menuPos.top }),
        transform: "translateX(-100%)",
      }}
    >
      {isRaw && onTranslate && (
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onTranslate(); }}
        >
          <Languages className="w-3.5 h-3.5" /> 翻译
        </button>
      )}
      {onRename && (
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(); }}
        >
          <Pencil className="w-3.5 h-3.5" /> 重命名
        </button>
      )}
      {onOpenFolder && (
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onOpenFolder(); }}
        >
          <FolderOpen className="w-3.5 h-3.5" /> 打开目录
        </button>
      )}
      {(onRename || onOpenFolder) && onDelete && (
        <div className="my-0.5 mx-1 h-px bg-slate-100" />
      )}
      {onDelete && (
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 hover:text-red-600 flex items-center gap-2 rounded-lg transition-colors"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
        >
          <Trash2 className="w-3.5 h-3.5" /> 删除
        </button>
      )}
    </div>,
    document.body,
  );

  return (
    <div
      className="group px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between"
      onClick={handleRowClick}
    >
      <div className="flex items-center gap-4">
        {batchMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
              selected
                ? "bg-indigo-600 border-indigo-600"
                : "border-slate-300 hover:border-indigo-400 bg-white"
            }`}
          >
            {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
          </button>
        )}
        <div
          onMouseEnter={(e) => coverUrl && onShowPreview(e.currentTarget)}
          onMouseLeave={onHidePreview}
        >
          {coverUrl ? (
            <div className={`w-10 h-14 rounded-lg overflow-hidden shrink-0 border ${borderClass}`}>
              <img src={coverUrl} alt={title} className="w-full h-full object-cover object-top" />
            </div>
          ) : isRaw ? (
            <div className="w-10 h-14 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0">Raw</div>
          ) : (
            <div className="w-10 h-14 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5" />
            </div>
          )}
        </div>
        <div>
          <h4
            className="font-bold text-slate-800"
            onMouseEnter={(e) => coverUrl && onShowPreview(e.currentTarget)}
            onMouseLeave={onHidePreview}
          >
            {title}
          </h4>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${kindBadgeClass}`}>
              {kindLabel}
            </span>
            {pageCount > 0 && <span className="text-xs text-slate-400">{pageCount}页</span>}
            <span className="text-xs text-slate-400">{dateLabel}</span>
          </div>
        </div>
      </div>

      {!batchMode && hasMenuItems && (
        <div className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={(e) => { e.stopPropagation(); menuOpen ? setMenuOpen(false) : openMenu(); }}
            className={`p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors ${
              menuOpen ? "opacity-100 bg-slate-100 text-slate-600" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      )}
      {dropdownMenu}
    </div>
  );
}
