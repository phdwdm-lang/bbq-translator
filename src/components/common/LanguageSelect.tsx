"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Star } from "lucide-react";
import type { LanguageOption } from "../../constants/languages";

interface LanguageSelectProps {
  options: LanguageOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  defaultLang?: string;
  onDefaultLangChange?: (lang: string) => void;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

const DEFAULT_BADGE = (
  <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium shrink-0">
    默认
  </span>
);

export function LanguageSelect({
  options,
  value,
  onChange,
  disabled = false,
  defaultLang = "",
  onDefaultLangChange,
}: LanguageSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DropdownPosition>({ top: 0, left: 0, width: 0 });

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;
  const isCurrentDefault = !!defaultLang && value === defaultLang;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = () => updatePosition();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition]);

  const dropdownPanel = open ? createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <div className="max-h-52 overflow-y-auto py-1">
        {options.map((opt) => {
          const isSelected = opt.value === value;
          const isDefault = !!defaultLang && opt.value === defaultLang;
          return (
            <button
              key={opt.value}
              type="button"
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                isSelected
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              onClick={() => onChange(opt.value)}
            >
              <span className="truncate flex-1">{opt.label}</span>
              {isDefault && DEFAULT_BADGE}
              {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
            </button>
          );
        })}
      </div>

      {onDefaultLangChange && (
        <>
          <div className="h-px bg-slate-100" />
          <button
            type="button"
            className="w-full px-3 py-2.5 flex items-center gap-2 text-xs hover:bg-slate-50 transition-colors"
            onClick={() => onDefaultLangChange(isCurrentDefault ? "" : value)}
          >
            <Star
              className={`w-3.5 h-3.5 transition-colors ${
                isCurrentDefault ? "text-amber-500 fill-amber-500" : "text-slate-300"
              }`}
            />
            <span className={isCurrentDefault ? "text-slate-700 font-medium" : "text-slate-500"}>
              {isCurrentDefault ? "已设为默认语言" : "设为默认语言"}
            </span>
          </button>
        </>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between p-2.5 bg-white border rounded-xl text-sm font-medium outline-none transition-colors ${
          open ? "border-indigo-500 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {selectedLabel}
          {isCurrentDefault && DEFAULT_BADGE}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {dropdownPanel}
    </div>
  );
}
