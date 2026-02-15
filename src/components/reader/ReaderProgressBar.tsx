"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type ReaderProgressBarProps = {
  currentIndex: number;
  totalCount: number;
  onSeek: (index: number) => void;
};

export function ReaderProgressBar({ currentIndex, totalCount, onSeek }: ReaderProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const rafId = useRef(0);

  const displayIndex = dragIndex ?? currentIndex;
  const progressPct = totalCount > 0 ? ((displayIndex + 1) / totalCount) * 100 : 0;

  const calcIndexFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || totalCount <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pct * (totalCount - 1));
    },
    [totalCount]
  );

  const flushSeek = useCallback(() => {
    if (pendingSeek.current !== null) {
      onSeek(pendingSeek.current);
      pendingSeek.current = null;
    }
  }, [onSeek]);

  const scheduleSeek = useCallback(
    (index: number) => {
      pendingSeek.current = index;
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(flushSeek);
    },
    [flushSeek]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDragging.current = true;
      const idx = calcIndexFromClientX(e.clientX);
      setDragIndex(idx);
      onSeek(idx);
    },
    [calcIndexFromClientX, onSeek]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const idx = calcIndexFromClientX(e.clientX);
      setDragIndex(idx);
      scheduleSeek(idx);
    },
    [calcIndexFromClientX, scheduleSeek]
  );

  const endDrag = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    cancelAnimationFrame(rafId.current);
    if (pendingSeek.current !== null) {
      onSeek(pendingSeek.current);
      pendingSeek.current = null;
    }
    setDragIndex(null);
  }, [onSeek]);

  const handlePointerUp = useCallback(() => {
    endDrag();
  }, [endDrag]);

  useEffect(() => {
    window.addEventListener("pointerup", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      cancelAnimationFrame(rafId.current);
    };
  }, [endDrag]);

  return (
    <footer className="h-10 bg-slate-800/95 backdrop-blur border-t border-slate-700 flex items-center px-6 shrink-0">
      <div className="flex-1 flex items-center gap-4">
        <span className="text-xs text-slate-500 w-8">{displayIndex + 1}</span>
        <div
          ref={trackRef}
          className="flex-1 h-4 flex items-center cursor-pointer group touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-visible relative">
            <div
              className="h-full bg-indigo-500 group-hover:bg-indigo-400 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 pointer-events-none"
              style={{ left: `calc(${progressPct}% - 6px)` }}
            />
          </div>
        </div>
        <span className="text-xs text-slate-400 w-12 text-right">{displayIndex + 1} / {totalCount}</span>
      </div>
    </footer>
  );
}
