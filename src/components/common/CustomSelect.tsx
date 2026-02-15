"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

type SelectSize = "sm" | "md";

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  size?: SelectSize;
  className?: string;
}

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

const SIZE_CLASSES: Record<SelectSize, { trigger: string; item: string; dropdown: string }> = {
  md: {
    trigger: "p-2.5 text-sm rounded-xl",
    item: "px-3 py-2 text-sm",
    dropdown: "rounded-xl",
  },
  sm: {
    trigger: "p-2 text-xs rounded-lg",
    item: "px-2.5 py-1.5 text-xs",
    dropdown: "rounded-lg",
  },
};

export function CustomSelect({
  options,
  value,
  onChange,
  disabled = false,
  size = "md",
  className,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DropdownPosition>({ top: 0, left: 0, width: 0 });

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

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

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
  };

  const sizeClasses = SIZE_CLASSES[size];

  const dropdownPanel = open
    ? createPortal(
        <div
          ref={dropdownRef}
          className={`fixed z-[9999] bg-white border border-slate-200 ${sizeClasses.dropdown} shadow-xl overflow-hidden`}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="max-h-52 overflow-y-auto py-1">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  className={`w-full text-left flex items-center gap-2 transition-colors ${sizeClasses.item} ${
                    isSelected
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : opt.disabled
                        ? "text-slate-300 cursor-not-allowed"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <span className="truncate flex-1">{opt.label}</span>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full flex items-center justify-between bg-white border font-medium outline-none transition-colors ${sizeClasses.trigger} ${
          open
            ? "border-indigo-500 ring-2 ring-indigo-100"
            : "border-slate-200 hover:border-slate-300"
        } disabled:opacity-50 disabled:cursor-not-allowed ${className ?? ""}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {dropdownPanel}
    </div>
  );
}
