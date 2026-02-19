"use client";

import { useEffect, useMemo, useRef, useState, useCallback, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Loader2, Download,
  Scroll, File, Columns2, ZoomIn, ZoomOut, Maximize2, Settings,
} from "lucide-react";

import { QUICK_BOOK_ID, ensureQuickBook, loadJobs, loadLibrary, subscribeLibrary, subscribeJobs, type BatchJob, type MangaBook, type MangaPage } from "../../../../lib/storage";
import { getBlob } from "../../../../lib/blobDb";
import { SettingsModal } from "../../../../components/SettingsModal";
import { useReaderKeyboard } from "../../../../hooks/useReaderKeyboard";
import { useReaderZoom } from "../../../../hooks/useReaderZoom";
import { ReaderContent } from "../../../../components/reader/ReaderContent";
import { ReaderProgressBar } from "../../../../components/reader/ReaderProgressBar";
import { READER_VIEW_MODES, DEFAULT_VIEW_MODE, type ReaderViewMode } from "../../../../constants/reader";
import { useTitleBarOverlay } from "../../../../hooks/useTitleBarOverlay";
import { TITLE_BAR_OVERLAY_TRANSPARENT, TITLE_BAR_SYMBOL_COLOR_MUTED } from "../../../../constants/window";

export default function ChapterDetailPage(props: { params: Promise<{ bookId: string; chapterId: string }> }) {
  const params = usePromise(props.params);
  const bookId = params.bookId;
  const chapterId = params.chapterId;
  const router = useRouter();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [viewMode, setViewMode] = useState<ReaderViewMode>(DEFAULT_VIEW_MODE);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const { zoom, zoomPct, zoomIn, zoomOut, resetZoom } = useReaderZoom();

  useTitleBarOverlay({
    color: TITLE_BAR_OVERLAY_TRANSPARENT,
    symbolColor: TITLE_BAR_SYMBOL_COLOR_MUTED,
  });

  const safeDecode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };

  const taskId = safeDecode(chapterId);

  const [books, setBooks] = useState<MangaBook[]>(() => {
    try {
      ensureQuickBook();
      return loadLibrary();
    } catch {
      return [];
    }
  });
  const [jobs, setJobs] = useState<BatchJob[]>(() => {
    try {
      return loadJobs();
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [rawPages, setRawPages] = useState<Array<{ id: string; fileName: string; url: string }>>([]);
  const rawUrlsRef = useRef<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    ensureQuickBook();
    setBooks(loadLibrary());
    setJobs(loadJobs());
    const unsub = subscribeLibrary(() => setBooks(loadLibrary()));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeJobs(() => setJobs(loadJobs()));
    return () => unsub();
  }, []);

  const book = useMemo(() => {
    const found = books.find((b) => b.id === bookId);
    if (found) return found;
    if (bookId === QUICK_BOOK_ID) return { id: QUICK_BOOK_ID, title: "翻译内容", createdAt: 0, chapters: [] } as MangaBook;
    return null;
  }, [books, bookId]);

  const chapter = useMemo(() => {
    return book?.chapters.find((x) => x.id === taskId) ?? null;
  }, [book?.chapters, taskId]);

  useEffect(() => {
    if (!book) return;
    if (!chapter) {
      setTitle("");
      setRawPages([]);
      return;
    }

    rawUrlsRef.current.forEach((u) => {
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    });
    rawUrlsRef.current = [];

    setError("");
    void (async () => {
      try {
        setTitle(chapter.title);

        const pages = (chapter.pages || []) as MangaPage[];
        const kind = (chapter.kind || "raw") as "raw" | "cooked";
        const rows: Array<{ id: string; fileName: string; url: string }> = [];
        for (const p of pages) {
          const preferKey = kind === "cooked" ? (p.translatedBlobKey || p.originalBlobKey) : p.originalBlobKey;
          const blob = await getBlob(preferKey);
          if (blob) {
            const url = URL.createObjectURL(blob);
            rawUrlsRef.current.push(url);
            rows.push({ id: p.id, fileName: p.fileName, url });
            continue;
          }
          if (kind === "cooked" && p.translatedUrl) {
            rows.push({ id: p.id, fileName: p.fileName, url: p.translatedUrl });
          }
        }
        setRawPages(rows);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setError(message);
      }
    })();

    return () => {
      rawUrlsRef.current.forEach((u) => {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      });
      rawUrlsRef.current = [];
    };
  }, [bookId, taskId, book, chapter, chapter?.updatedAt, chapter?.pages?.length]);

  const headerTitle = book?.title || "章节";
  const currentJob = useMemo(() => {
    if (bookId === QUICK_BOOK_ID) return null;
    return jobs.find((j) => j.targetBookId === bookId && j.targetChapterId === taskId) ?? null;
  }, [jobs, bookId, taskId]);
  const jobPct = currentJob && currentJob.total > 0 ? Math.min(100, Math.round((currentJob.completed / currentJob.total) * 100)) : 0;

  const displayImages = rawPages;

  const totalImageCount = displayImages.length;
  const isReading = viewerIndex !== null;

  const adjacentChapters = useMemo(() => {
    const chapters = book?.chapters ?? [];
    if (chapters.length === 0) return { prev: null, next: null };
    const sorted = [...chapters].sort((a, b) => (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt));
    const idx = sorted.findIndex((c) => c.id === taskId);
    return {
      prev: idx > 0 ? sorted[idx - 1] : null,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [book?.chapters, taskId]);

  const pageStep = viewMode === "double" ? 2 : 1;

  const goToPrevPage = useCallback(() => {
    setViewerIndex((v) => (v === null ? null : Math.max(0, v - pageStep)));
  }, [pageStep]);

  const goToNextPage = useCallback(() => {
    setViewerIndex((v) => {
      if (v === null) return null;
      return Math.min(totalImageCount - 1, v + pageStep);
    });
  }, [totalImageCount, pageStep]);

  const exitViewer = useCallback(() => {
    setViewerIndex(null);
    setToolbarVisible(true);
  }, []);

  const handleBackClick = useCallback(() => {
    if (isReading) {
      exitViewer();
    } else {
      router.push(`/shelf/${encodeURIComponent(bookId)}`);
    }
  }, [isReading, exitViewer, router, bookId]);

  const navigateToChapter = useCallback((chapterId: string) => {
    router.push(`/shelf/${encodeURIComponent(bookId)}/${encodeURIComponent(chapterId)}`);
  }, [router, bookId]);

  const toggleToolbar = useCallback(() => {
    if (isReading) {
      setToolbarVisible((v) => !v);
    }
  }, [isReading]);

  const handleScrollProgress = useCallback((idx: number) => {
    setViewerIndex(idx);
  }, []);

  useReaderKeyboard({
    enabled: isReading,
    onPrev: goToPrevPage,
    onNext: goToNextPage,
    onExit: exitViewer,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
  });

  const VIEW_MODE_ICON_MAP: Record<ReaderViewMode, React.ComponentType<{ className?: string }>> = {
    scroll: Scroll,
    single: File,
    double: Columns2,
  };

  const renderImageGrid = (
    items: Array<{ id: string; url: string; fileName: string }>,
    onClickItem: (idx: number) => void
  ) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map((item, idx) => (
        <button
          type="button"
          key={item.id}
          className="group bg-slate-700 rounded-xl overflow-hidden text-left shadow-lg hover:ring-2 hover:ring-indigo-500 transition-all"
          onClick={() => onClickItem(idx)}
        >
          <div className="aspect-[3/4] bg-slate-600 overflow-hidden">
            <img src={item.url} alt={item.fileName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          </div>
          <div className="px-2.5 py-2">
            <div className="text-[10px] text-slate-400 truncate">{item.fileName}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const toolbarBaseCls = "h-14 app-drag-region bg-slate-800/95 backdrop-blur border-b border-slate-700 flex items-center justify-between pl-6 pr-[140px] z-20 transition-transform duration-300";
  const toolbarCls = toolbarVisible
    ? `${toolbarBaseCls} translate-y-0`
    : `${toolbarBaseCls} -translate-y-full pointer-events-none`;

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-slate-800 text-slate-100 relative">
      {/* Reader Toolbar */}
      <header className={toolbarCls} style={{ position: isReading ? "absolute" : "relative", top: 0, left: 0, right: 0 }}>
        <div className="flex items-center gap-4">
          <button onClick={handleBackClick} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title={isReading ? "返回章节详情" : "返回章节列表"}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-sm truncate">{title || chapterId}</h1>
            <span className="text-[10px] text-slate-400 truncate block">{headerTitle}</span>
          </div>
        </div>

        {isReading && (
          <div className="flex items-center gap-3">
            {/* Page Navigation */}
            <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg px-3 py-1.5">
              <button className="p-1 hover:bg-white/10 rounded transition-colors" onClick={goToPrevPage} title="上一页">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium w-16 text-center">{(viewerIndex ?? 0) + 1} / {totalImageCount}</span>
              <button className="p-1 hover:bg-white/10 rounded transition-colors" onClick={goToNextPage} title="下一页">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-slate-600" />

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-700/50 rounded-lg p-1">
              {READER_VIEW_MODES.map((mode) => {
                const Icon = VIEW_MODE_ICON_MAP[mode.id];
                const isActive = viewMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    className={isActive ? "p-1.5 bg-white/10 rounded text-white" : "p-1.5 hover:bg-white/5 rounded text-slate-400"}
                    onClick={() => setViewMode(mode.id)}
                    title={mode.label}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" onClick={zoomOut} title="缩小 (-)">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button className="text-xs font-medium w-12 text-center hover:bg-white/10 rounded-lg py-1 transition-colors" onClick={resetZoom} title="重置缩放">
                {zoomPct}%
              </button>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" onClick={zoomIn} title="放大 (+)">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-colors" onClick={resetZoom} title="适应宽度">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      {error ? (
        <main className="flex-1 overflow-y-auto flex flex-col items-center py-8 gap-4">
          <div className="w-full max-w-3xl px-6">
            <div className="p-4 bg-red-900/30 border border-red-800 rounded-xl text-sm text-red-300">{error}</div>
          </div>
        </main>
      ) : loading ? (
        <main className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> 加载中…
        </main>
      ) : isReading ? (
        <>
          {/* Job progress overlay */}
          {currentJob && (currentJob.status === "running" || currentJob.status === "pending") && (
            <div className="w-full px-6 py-2 flex justify-center shrink-0">
              <div className="w-full max-w-3xl bg-indigo-900/50 rounded-xl border border-indigo-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-300">翻译中</span>
                  <span className="text-xs text-indigo-400">{currentJob.completed}/{currentJob.total}（{jobPct}%）</span>
                </div>
                <div className="h-1.5 bg-indigo-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${jobPct}%` }} />
                </div>
              </div>
            </div>
          )}

          <ReaderContent
            viewMode={viewMode}
            images={displayImages}
            viewerIndex={viewerIndex ?? 0}
            zoom={zoom}
            onPageChange={setViewerIndex}
            onToggleToolbar={toggleToolbar}
            onScrollProgress={handleScrollProgress}
            endSlot={
              <div className="w-full max-w-3xl py-16 flex flex-col items-center gap-6">
                <div className="w-20 h-20 rounded-full bg-slate-700 border-2 border-dashed border-slate-600 flex items-center justify-center text-slate-500">
                  <span className="text-[10px] text-center">End</span>
                </div>
                <h3 className="text-xl font-bold text-slate-300">本章阅读完毕</h3>
                <p className="text-sm text-slate-500">{title || chapterId}</p>
                <div className="flex items-center gap-4 mt-4">
                  {adjacentChapters.prev && (
                    <button
                      className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
                      onClick={() => navigateToChapter(adjacentChapters.prev!.id)}
                    >
                      <ChevronLeft className="w-4 h-4" /> 上一章
                    </button>
                  )}
                  {adjacentChapters.next && (
                    <button
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
                      onClick={() => navigateToChapter(adjacentChapters.next!.id)}
                    >
                      下一章 <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => router.push(`/shelf/${encodeURIComponent(bookId)}`)}
                  className="text-sm text-indigo-400 hover:underline mt-2"
                >
                  返回章节列表
                </button>
              </div>
            }
          />
        </>
      ) : totalImageCount === 0 ? (
        <main className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <div className="w-20 h-20 rounded-full bg-slate-700 border-2 border-dashed border-slate-600 flex items-center justify-center mb-4">
            <span className="text-[10px] text-center text-slate-500">空</span>
          </div>
          <p className="text-sm">该章节暂无图片</p>
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto flex flex-col items-center py-8 gap-4">
          {currentJob && (currentJob.status === "running" || currentJob.status === "pending") && (
            <div className="w-full max-w-3xl px-6">
              <div className="bg-indigo-900/50 rounded-xl border border-indigo-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-300">翻译中</span>
                  <span className="text-xs text-indigo-400">{currentJob.completed}/{currentJob.total}（{jobPct}%）</span>
                </div>
                <div className="h-1.5 bg-indigo-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${jobPct}%` }} />
                </div>
              </div>
            </div>
          )}
          <div className="w-full max-w-5xl px-6">
            {renderImageGrid(displayImages, (idx) => setViewerIndex(idx))}
          </div>
        </main>
      )}

      {/* Bottom Progress Bar */}
      {isReading && (
        <ReaderProgressBar
          currentIndex={viewerIndex ?? 0}
          totalCount={totalImageCount}
          onSeek={setViewerIndex}
        />
      )}

      <SettingsModal open={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
    </div>
  );
}
