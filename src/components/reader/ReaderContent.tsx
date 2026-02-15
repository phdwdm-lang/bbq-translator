"use client";

import React, { useRef, useEffect, useCallback } from "react";
import type { ReaderViewMode } from "../../constants/reader";

type ImageItem = { id: string; url: string; fileName: string };

type ReaderContentProps = {
  viewMode: ReaderViewMode;
  images: ImageItem[];
  viewerIndex: number;
  zoom: number;
  onPageChange: (index: number) => void;
  onToggleToolbar: () => void;
  onScrollProgress?: (index: number) => void;
  endSlot?: React.ReactNode;
};

export function ReaderContent({
  viewMode,
  images,
  viewerIndex,
  zoom,
  onPageChange,
  onToggleToolbar,
  onScrollProgress,
  endSlot,
}: ReaderContentProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastReportedIdx = useRef(viewerIndex);
  const scrollLocked = useRef(false);
  const lastDetectTime = useRef(0);
  const pendingDetectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const DETECT_THROTTLE_MS = 200;

  const setPageRef = useCallback((el: HTMLDivElement | null, idx: number) => {
    pageRefs.current[idx] = el;
  }, []);

  useEffect(() => {
    if (viewMode !== "scroll") return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const detectClosestPage = () => {
      if (scrollLocked.current) return;

      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;

      let closestIdx = 0;
      let closestDist = Infinity;

      pageRefs.current.forEach((el, idx) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const dist = Math.abs(pageCenter - containerCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });

      if (closestIdx !== lastReportedIdx.current) {
        lastReportedIdx.current = closestIdx;
        onScrollProgress?.(closestIdx);
      }
    };

    const handleScroll = () => {
      const now = Date.now();
      const elapsed = now - lastDetectTime.current;

      if (elapsed >= DETECT_THROTTLE_MS) {
        lastDetectTime.current = now;
        detectClosestPage();
      } else {
        if (pendingDetectTimer.current) clearTimeout(pendingDetectTimer.current);
        pendingDetectTimer.current = setTimeout(() => {
          lastDetectTime.current = Date.now();
          detectClosestPage();
          pendingDetectTimer.current = null;
        }, DETECT_THROTTLE_MS - elapsed);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (pendingDetectTimer.current) clearTimeout(pendingDetectTimer.current);
    };
  }, [viewMode, onScrollProgress]);

  useEffect(() => {
    if (viewMode !== "scroll") return;
    if (viewerIndex === lastReportedIdx.current) return;
    const el = pageRefs.current[viewerIndex];
    if (!el) return;

    scrollLocked.current = true;
    lastReportedIdx.current = viewerIndex;
    el.scrollIntoView({ behavior: "instant", block: "center" });
    requestAnimationFrame(() => { scrollLocked.current = false; });
  }, [viewMode, viewerIndex]);

  const scrollZoomStyle = { width: `${zoom * 100}%`, maxWidth: zoom > 1 ? "none" : "100%" };
  const zoomTransform = { transform: `scale(${zoom})`, transformOrigin: "top center" };

  if (viewMode === "scroll") {
    return (
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto flex flex-col items-center py-8 gap-4"
        onClick={onToggleToolbar}
      >
        {images.map((item, idx) => (
          <div
            key={item.id}
            ref={(el) => setPageRef(el, idx)}
            className="page-container flex justify-center shrink-0 px-4"
            style={{ width: zoom > 1 ? `${zoom * 100}%` : "100%", maxWidth: zoom > 1 ? "none" : "48rem" }}
          >
            <img
              src={item.url}
              alt={item.fileName}
              className="h-auto object-contain shadow-2xl select-none transition-[width] duration-200"
              style={scrollZoomStyle}
            />
          </div>
        ))}
        {endSlot && (
          <div onClick={(e) => e.stopPropagation()}>
            {endSlot}
          </div>
        )}
      </div>
    );
  }

  if (viewMode === "double") {
    const leftIdx = viewerIndex % 2 === 0 ? viewerIndex : viewerIndex - 1;
    const rightIdx = leftIdx + 1;
    const leftImg = images[leftIdx];
    const rightImg = rightIdx < images.length ? images[rightIdx] : null;
    const isLastSpread = rightIdx >= images.length - 1;

    return (
      <div
        className="flex-1 overflow-auto flex flex-col items-center py-8"
        onClick={onToggleToolbar}
      >
        <div className="my-auto flex flex-col items-center w-full">
          <div
            className="flex items-start gap-2 px-4 max-w-5xl w-full justify-center transition-transform duration-200"
            style={zoomTransform}
          >
            {leftImg && (
              <img
                src={leftImg.url}
                alt={leftImg.fileName}
                className="h-auto max-h-[80vh] object-contain rounded-lg shadow-2xl cursor-pointer select-none w-[48%]"
                onClick={(e) => {
                  e.stopPropagation();
                  if (leftIdx >= 2) onPageChange(leftIdx - 2);
                }}
              />
            )}
            {rightImg && (
              <img
                src={rightImg.url}
                alt={rightImg.fileName}
                className="h-auto max-h-[80vh] object-contain rounded-lg shadow-2xl cursor-pointer select-none w-[48%]"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextStart = rightIdx + 1;
                  if (nextStart < images.length) onPageChange(nextStart);
                }}
              />
            )}
          </div>
          {isLastSpread && endSlot && (
            <div className="mt-4" onClick={(e) => e.stopPropagation()}>
              {endSlot}
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentImage = images[viewerIndex];
  if (!currentImage) return null;
  const isLastPage = viewerIndex >= images.length - 1;

  return (
    <div
      className="flex-1 overflow-auto flex flex-col items-center py-8"
      onClick={onToggleToolbar}
    >
      <div className="my-auto flex flex-col items-center w-full">
        <div className="w-full max-w-3xl flex flex-col items-center gap-2 px-4">
          <img
            src={currentImage.url}
            alt={currentImage.fileName}
            className="w-full h-auto object-contain rounded-lg shadow-2xl cursor-pointer select-none transition-transform duration-200"
            style={zoomTransform}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLastPage) onPageChange(viewerIndex + 1);
            }}
          />
        </div>
        {isLastPage && endSlot && (
          <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            {endSlot}
          </div>
        )}
      </div>
    </div>
  );
}
