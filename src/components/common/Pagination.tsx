"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useDropdown } from "@/hooks/useDropdown";

const MAX_VISIBLE_PAGES = 5;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

interface PaginationProps {
  pageIndex: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function buildPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("ellipsis");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

function PageSizeSelect({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const { isOpen, toggle, close, containerRef } = useDropdown();

  const handleSelect = (size: number) => {
    onChange(size);
    close();
  };

  return (
    <div ref={containerRef} className="relative select-none">
      <button
        type="button"
        onClick={toggle}
        className={`h-8 pl-3 pr-7 text-xs font-medium rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
          isOpen
            ? "border-indigo-400 bg-indigo-50 text-indigo-600"
            : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
        }`}
      >
        {value} 话/页
      </button>
      <ChevronDown
        className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-transform duration-200 ${
          isOpen ? "rotate-180 text-indigo-600" : "text-slate-400"
        }`}
      />
      {isOpen && (
        <div className="absolute bottom-[calc(100%+6px)] right-0 min-w-full bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/60 p-1 z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {PAGE_SIZE_OPTIONS.map((size) => {
            const isActive = size === value;
            return (
              <button
                key={size}
                type="button"
                onClick={() => handleSelect(size)}
                className={`flex items-center justify-between gap-3 w-full px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                }`}
              >
                {size} 话/页
                <Check className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "opacity-100 text-indigo-600" : "opacity-0"}`} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Pagination({ pageIndex, totalPages, pageSize, onPageChange, onPageSizeChange }: PaginationProps) {
  const pages = totalPages > 1 ? buildPageNumbers(pageIndex, totalPages) : [];

  return (
    <div className="flex items-center gap-1.5">
      <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
      {totalPages > 1 && (
        <>
          <button
            type="button"
            disabled={pageIndex <= 1}
            onClick={() => onPageChange(Math.max(1, pageIndex - 1))}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center bg-white transition-colors disabled:text-slate-300 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {pages.map((p, idx) =>
            p === "ellipsis" ? (
              <span key={`e${idx}`} className="w-8 h-8 flex items-center justify-center text-xs text-slate-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                  p === pageIndex
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={pageIndex >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, pageIndex + 1))}
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center bg-white transition-colors disabled:text-slate-300 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
