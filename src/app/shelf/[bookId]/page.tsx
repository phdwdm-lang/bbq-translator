"use client";

import { useEffect, useMemo, useRef, useState, use as usePromise, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X, Check, MoreHorizontal, Pencil, Image as ImageIcon, Trash2, Import } from "lucide-react";
import { AppShell } from "../../../components/layout/AppShell";

import {
  addPageToChapter,
  QUICK_BOOK_ID,
  createChapter,
  deleteBook,
  createJob,
  ensureQuickBook,
  getAllBlobKeysFromChapter,
  loadJobs,
  loadLibrary,
  removeChapters,
  renameChapter,
  setBookCover,
  subscribeLibrary,
  subscribeJobs,
  updatePageInChapter,
  type BatchJob,
  type MangaBook,
} from "../../../lib/storage";
import { deleteBlob, getBlob, putBlob } from "../../../lib/blobDb";
import { resolveBookCoverSource } from "../../../lib/cover";
import { importToImages } from "../../../lib/importExtract";
import { naturalCompare, sanitizeFolderName, makeTimestampName } from "../../../lib/utils";
import { STORAGE_KEY_DEFAULT_LANG, STORAGE_KEY_LAST_LANG, DEFAULT_INITIAL_LANG } from "../../../constants/languages";
import type { FileSystemEntryLike } from "../../../types/fileSystem";
import { listExtensions, probeLang, resolveImageToBlob, scanMangaImage, type ExtensionItem } from "../../../lib/translateClient";
import { isApiKeyConfigured, getProviderDisplayName } from "../../../constants/credentials";
import { cancelJob, runBatchJob } from "../../../lib/jobRunner";
import { SettingsModal } from "../../../components/SettingsModal";
import { ProgressModal } from "../../../components/common/ProgressModal";
import { ConfirmDialog } from "../../../components/common/ConfirmDialog";
import { Pagination } from "../../../components/common/Pagination";
import { DETECTION_RESOLUTION, INPAINTING_SIZE } from "../../../constants/editor";
import { ChapterListItem } from "../../../components/shelf/ChapterListItem";
import { BookEditModal } from "../../../components/common/BookEditModal";
import { TranslateModal } from "../../../components/common/TranslateModal";
import { useDialog } from "../../../components/common/DialogProvider";
import { openChapterFolder } from "../../../lib/exportChapter";

export default function ShelfBookPage(props: { params: Promise<{ bookId: string }> }) {
  const params = usePromise(props.params);
  const bookId = params.bookId;
  const router = useRouter();
  const { confirm, alert, prompt } = useDialog();
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [bookMenuOpen, setBookMenuOpen] = useState(false);
  const bookMenuRef = useRef<HTMLDivElement | null>(null);

  const [editBookOpen, setEditBookOpen] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverDragOver, setCoverDragOver] = useState(false);

  const [books, setBooks] = useState<MangaBook[]>(() => {
    if (typeof window === "undefined") return [];
    ensureQuickBook();
    return loadLibrary();
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  type ChapterFilter = "all" | "raw" | "cooked";
  const [chapterFilter, setChapterFilter] = useState<ChapterFilter>(() => {
    if (typeof window === "undefined") return "all";
    if (bookId === QUICK_BOOK_ID) return "all";
    try {
      const saved = window.sessionStorage.getItem(`mts_shelf_chapter_filter:${bookId}`);
      if (saved === "all" || saved === "raw" || saved === "cooked") return saved;
    } catch {
      // ignore
    }
    return "all";
  });
  const [batchMode, setBatchMode] = useState(false);
  const [rawError, setRawError] = useState("");
  const rawInputRef = useRef<HTMLInputElement | null>(null);
  const [jobs, setJobs] = useState<BatchJob[]>(() => {
    if (typeof window === "undefined") return [];
    return loadJobs();
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const SCROLL_KEY = `mts_shelf_scroll:${bookId}`;
  const PAGE_KEY = `mts_shelf_page:${bookId}`;
  const [pageIndex, setPageIndex] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    try {
      const saved = window.sessionStorage.getItem(PAGE_KEY);
      if (saved) return Math.max(1, parseInt(saved, 10) || 1);
    } catch { /* ignore */ }
    return 1;
  });

  useEffect(() => {
    try { window.sessionStorage.setItem(PAGE_KEY, String(pageIndex)); } catch { /* ignore */ }
  }, [pageIndex, PAGE_KEY]);

  const SCROLL_CONTAINER_ID = "app-main-scroll";
  const getScrollContainer = () => document.getElementById(SCROLL_CONTAINER_ID);

  const pendingScrollY = useRef<number | null>(null);
  useEffect(() => {
    try {
      const savedY = window.sessionStorage.getItem(SCROLL_KEY);
      if (savedY) {
        pendingScrollY.current = parseInt(savedY, 10) || 0;
        window.sessionStorage.removeItem(SCROLL_KEY);
      }
    } catch { /* ignore */ }
  }, [SCROLL_KEY]);

  useEffect(() => {
    if (loading || pendingScrollY.current === null) return;
    const targetY = pendingScrollY.current;
    pendingScrollY.current = null;
    const el = getScrollContainer();
    if (!el) return;
    let attempts = 0;
    const tryScroll = () => {
      el.scrollTop = targetY;
      attempts++;
      if (Math.abs(el.scrollTop - targetY) > 1 && attempts < 10) {
        requestAnimationFrame(tryScroll);
      }
    };
    requestAnimationFrame(tryScroll);
  }, [loading]);

  const navigateToChapter = (href: string) => {
    const el = getScrollContainer();
    try { window.sessionStorage.setItem(SCROLL_KEY, String(el?.scrollTop ?? 0)); } catch { /* ignore */ }
    router.push(href);
  };
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const [translateJobIds, setTranslateJobIds] = useState<string[]>([]);
  const [translateTargets, setTranslateTargets] = useState<Array<{ id: string; title: string; count: number }>>([]);
  const [translateSourceLang, setTranslateSourceLang] = useState<string>("auto");
  const [defaultLang, setDefaultLang] = useState<string>(() => {
    try { return window.localStorage.getItem(STORAGE_KEY_DEFAULT_LANG) || ""; } catch { return ""; }
  });
  const [translateTargetLang, setTranslateTargetLang] = useState<string>(() => {
    try {
      const def = window.localStorage.getItem(STORAGE_KEY_DEFAULT_LANG);
      if (def) return def;
      const last = window.localStorage.getItem(STORAGE_KEY_LAST_LANG);
      if (last) return last;
    } catch {}
    return DEFAULT_INITIAL_LANG;
  });
  const handleDefaultLangChange = (lang: string) => {
    setDefaultLang(lang);
    try {
      if (lang) window.localStorage.setItem(STORAGE_KEY_DEFAULT_LANG, lang);
      else window.localStorage.removeItem(STORAGE_KEY_DEFAULT_LANG);
    } catch {}
  };

  const [advDetectionSize, setAdvDetectionSize] = useState<number>(DETECTION_RESOLUTION);
  const [advInpaintingSize, setAdvInpaintingSize] = useState<number>(INPAINTING_SIZE);
  const [advDetector, setAdvDetector] = useState<string>("default");
  const [advTranslator, setAdvTranslator] = useState<string>("deepseek");
  const [advOcrMode, setAdvOcrMode] = useState<string>("auto");
  const [advInpainter, setAdvInpainter] = useState<string>("lama_mpe");

  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [settingsFocusExtId, setSettingsFocusExtId] = useState<string>("");

  const refreshExtensions = async () => {
    try {
      const items = await listExtensions();
      setExtensions(items);
    } catch {
      setExtensions([]);
    }
  };

  const installedById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const it of extensions) map.set(it.id, Boolean(it.installed));
    return map;
  }, [extensions]);

  useEffect(() => {
    if (translateOpen) void refreshExtensions();
  }, [translateOpen]);

  const ensureExtensionOrOpenSettings = (extId: string, title: string) => {
    const installed = installedById.get(extId);
    if (installed) return true;
    void alert({ title: "提示", message: `该功能需要先安装 ${title} 拓展包。` });
    setSettingsFocusExtId(extId);
    setShowSettingsModal(true);
    return false;
  };

  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressStage, setProgressStage] = useState<string>("");
  const [progressValue, setProgressValue] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>("");
  const [progressError, setProgressError] = useState<string>("");
  const [progressSuccessCount, setProgressSuccessCount] = useState<number>(0);
  const [progressFailedCount, setProgressFailedCount] = useState<number>(0);
  const [progressTotalCount, setProgressTotalCount] = useState<number>(0);


  useEffect(() => {
    const unsub = subscribeLibrary(() => setBooks(loadLibrary()));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!bookMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = bookMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setBookMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [bookMenuOpen]);

  useEffect(() => {
    const unsub = subscribeJobs(() => setJobs(loadJobs()));
    return () => unsub();
  }, []);

  const prevBookIdRef = useRef(bookId);
  useEffect(() => {
    if (prevBookIdRef.current !== bookId) {
      prevBookIdRef.current = bookId;
      setSelectedIds(new Set());
      setPageIndex(1);
    }
  }, [bookId]);

  const book = useMemo(() => {
    const found = books.find((b) => b.id === bookId);
    if (found) return found;
    if (bookId === QUICK_BOOK_ID) return { id: QUICK_BOOK_ID, title: "翻译内容", createdAt: 0, chapters: [] } as MangaBook;
    return null;
  }, [books, bookId]);

  const isQuick = bookId === QUICK_BOOK_ID;
  const headerTitle = book?.title || (isQuick ? "翻译内容" : "书籍");

  const collectBlobKeysFromBook = (b: MangaBook): string[] => {
    const keys: string[] = [];
    if (b.coverBlobKey) keys.push(b.coverBlobKey);
    for (const ch of b.chapters || []) {
      if (ch.coverBlobKey) keys.push(ch.coverBlobKey);
      for (const p of ch.pages || []) {
        if (p.originalBlobKey) keys.push(p.originalBlobKey);
        if (p.translatedBlobKey) keys.push(p.translatedBlobKey);
        if (p.renderedBlobKey) keys.push(p.renderedBlobKey);
      }
    }
    return Array.from(new Set(keys.filter(Boolean)));
  };

  const deleteCurrentBookAndCleanup = async () => {
    if (isQuick) {
      await alert({ title: "提示", message: "系统书籍不可删除" });
      return;
    }
    if (!book) return;
    const ok = await confirm({ title: "确认删除", message: `确定删除书籍“${book.title}”吗？\n\n将同时删除该书下的章节与页面（本地数据不可恢复）。`, variant: "danger", confirmLabel: "删除" });
    if (!ok) return;

    setBookMenuOpen(false);
    const removed = deleteBook(bookId);
    if (!removed) return;

    const keys = collectBlobKeysFromBook(removed);
    await Promise.all(
      keys.map(async (k) => {
        try {
          await deleteBlob(k);
        } catch {
          // ignore
        }
      }),
    );

    router.push("/shelf");
  };

  const coverSource = useMemo(() => {
    if (isQuick) return null;
    return resolveBookCoverSource(book);
  }, [book, isQuick]);
  const [coverDisplayUrl, setCoverDisplayUrl] = useState<string>("");

  useEffect(() => {
    if (isQuick) {
      setCoverDisplayUrl((prev) => {
        if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return "";
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      let nextUrl = "";

      try {
        if (coverSource?.url) {
          nextUrl = coverSource.url;
        } else if (coverSource?.blobKey) {
          const blob = await getBlob(coverSource.blobKey);
          if (blob) nextUrl = URL.createObjectURL(blob);
        }
      } catch {
        nextUrl = "";
      }

      if (cancelled) {
        if (nextUrl.startsWith("blob:")) URL.revokeObjectURL(nextUrl);
        return;
      }

      setCoverDisplayUrl((prev) => {
        if (prev.startsWith("blob:") && prev !== nextUrl) URL.revokeObjectURL(prev);
        return nextUrl;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isQuick, coverSource?.blobKey, coverSource?.url]);

  const chapterFilterStorageKey = useMemo(() => `mts_shelf_chapter_filter:${bookId}`, [bookId]);

  useEffect(() => {
    if (bookId === QUICK_BOOK_ID) {
      setChapterFilter("all");
      return;
    }
    try {
      const saved = window.sessionStorage.getItem(chapterFilterStorageKey);
      if (saved === "all" || saved === "raw" || saved === "cooked") setChapterFilter(saved as ChapterFilter);
    } catch {
      // ignore
    }
  }, [bookId, chapterFilterStorageKey]);

  useEffect(() => {
    if (bookId === QUICK_BOOK_ID) return;
    try {
      window.sessionStorage.setItem(chapterFilterStorageKey, chapterFilter);
    } catch {
      // ignore
    }
  }, [bookId, chapterFilter, chapterFilterStorageKey]);

  const rawChapters = useMemo(() => {
    const chapters = book?.chapters ?? [];
    return chapters.filter((c) => (c.kind || "raw") === "raw");
  }, [book?.chapters]);

  const cookedChapters = useMemo(() => {
    const chapters = book?.chapters ?? [];
    return chapters.filter((c) => (c.kind || "raw") === "cooked");
  }, [book?.chapters]);

  const quickLocalChapters = useMemo(() => {
    if (!isQuick) return [];
    const chapters = book?.chapters ?? [];
    return chapters
      .filter((c) => (c.kind || "raw") === "cooked")
      .slice()
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  }, [isQuick, book?.chapters]);

  const allChapters = useMemo(() => {
    const chapters = book?.chapters ?? [];
    return chapters.slice().sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  }, [book?.chapters]);

  const cookedCount = isQuick ? quickLocalChapters.length : cookedChapters.length;
  const rawCount = isQuick ? 0 : rawChapters.length;

  type QuickListItem = {
    key: string;
    id: string;
    title: string;
    count: number;
    ts: number;
    href: string;
    coverBlobKey?: string;
  };

  const quickItems = useMemo((): QuickListItem[] => {
    if (!isQuick) return [];
    return (quickLocalChapters || []).map((ch) => {
      const fp = ch.pages?.[0];
      return {
        key: ch.id,
        id: ch.id,
        title: ch.title,
        count: ch.pages.length,
        ts: (ch.updatedAt || ch.createdAt) as number,
        href: `/shelf/${encodeURIComponent(bookId)}/${encodeURIComponent(ch.id)}`,
        coverBlobKey: fp?.translatedBlobKey || fp?.originalBlobKey,
      };
    });
  }, [isQuick, quickLocalChapters, bookId]);

  const allCount = isQuick ? quickItems.length : allChapters.length;

  const chapterCreatedTs = useMemo(() => {
    const chapters = book?.chapters ?? [];
    const vals = chapters.map((c) => c.createdAt).filter((n) => typeof n === "number" && n > 0);
    return vals.length ? Math.min(...vals) : 0;
  }, [book?.chapters]);

  const chapterUpdatedTs = useMemo(() => {
    const chapters = book?.chapters ?? [];
    const vals = chapters
      .map((c) => (c.updatedAt || c.createdAt) as number)
      .filter((n) => typeof n === "number" && n > 0);
    return vals.length ? Math.max(...vals) : 0;
  }, [book?.chapters]);

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const translateJobs = useMemo(() => translateJobIds.map((id) => jobById.get(id)).filter(Boolean) as BatchJob[], [translateJobIds, jobById]);
  const translateTotal = useMemo(() => translateJobs.reduce((s, j) => s + (j.total || 0), 0), [translateJobs]);
  const translateDone = useMemo(() => translateJobs.reduce((s, j) => s + (j.completed || 0), 0), [translateJobs]);
  

  const progressTitle =
    progressStage === "完成" ? "已完成" : progressStage === "失败" ? "失败" : progressStage === "已取消" ? "已取消" : "正在翻译";

  useEffect(() => {
    if (!showProgressModal) return;
    if (translateJobIds.length === 0) return;

    const total = translateTotal;
    const done = translateDone;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    setProgressValue(pct);
    setProgressText(`${done}/${total || "-"}`);

    const allItems = translateJobs.flatMap((j) => j.items || []);
    const successItems = allItems.filter((it) => it.status === "success").length;
    const failedItems = allItems.filter((it) => it.status === "error").length;
    setProgressSuccessCount(successItems);
    setProgressFailedCount(failedItems);
    setProgressTotalCount(total);

    const hasError = translateJobs.some((j) => j.status === "error");
    const allDone = translateJobs.length > 0 && translateJobs.every((j) => j.status === "success" || j.status === "error");

    if (allDone) {
      if (failedItems === total) {
        setProgressStage("失败");
      } else {
        setProgressStage("完成");
      }
      setProgressValue(100);
      const firstErr = allItems.find((it) => it.status === "error" && it.error)?.error;
      if (firstErr) setProgressError(firstErr);
      return;
    }

    if (hasError && !allDone) {
      const firstErr = allItems.find((it) => it.status === "error" && it.error)?.error;
      if (firstErr) setProgressError(firstErr);
    }

    setProgressStage("翻译中");
  }, [showProgressModal, translateJobIds.length, translateJobs, translateDone, translateTotal]);

  const failedJobChapterIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isQuick) return;
    const failedJobs = jobs.filter(
      (j) => j.targetBookId === bookId && j.status === "error" && j.completed === 0
    );
    for (const fj of failedJobs) {
      if (failedJobChapterIdsRef.current.has(fj.targetChapterId)) continue;
      failedJobChapterIdsRef.current.add(fj.targetChapterId);
      const chapter = book?.chapters?.find((c) => c.id === fj.targetChapterId);
      if (chapter && (!chapter.pages || chapter.pages.length === 0)) {
        removeChapters(bookId, [fj.targetChapterId]);
      }
    }
  }, [isQuick, jobs, bookId, book?.chapters]);

  const runningJobs = useMemo(() => {
    if (isQuick) return [] as BatchJob[];
    return jobs.filter((j) => j.targetBookId === bookId && (j.status === "running" || j.status === "pending"));
  }, [isQuick, jobs, bookId]);
  const runningTotal = useMemo(() => runningJobs.reduce((s, j) => s + (j.total || 0), 0), [runningJobs]);
  const runningDone = useMemo(() => runningJobs.reduce((s, j) => s + (j.completed || 0), 0), [runningJobs]);
  const runningPct = runningTotal > 0 ? Math.min(100, Math.round((runningDone / runningTotal) * 100)) : 0;
  const chapterTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of book?.chapters ?? []) m.set(c.id, c.title);
    return m;
  }, [book?.chapters]);

  const formatDate = (ts: number) => {
    try {
      const n = typeof ts === "number" ? ts : Number(ts);
      if (!Number.isFinite(n) || n <= 0) return "-";
      const ms = n < 1_000_000_000_000 ? n * 1000 : n;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return "-";

      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60 * 1000) return "刚刚";
      if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 1000)))}分钟前`;

      const pad2 = (x: number) => String(x).padStart(2, "0");
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

      if (d.getTime() >= startOfToday.getTime()) {
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      }
      if (d.getTime() >= startOfYesterday.getTime() && d.getTime() < startOfToday.getTime()) {
        return "昨天";
      }

      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      if (d.getFullYear() === now.getFullYear()) return `${mm}.${dd}`;
      return `${d.getFullYear()}.${mm}.${dd}`;
    } catch {
      return "-";
    }
  };

  if (!book) {
    return (
      <>
        <AppShell title="章节" backHref="/shelf" onOpenSettings={() => setShowSettingsModal(true)}>
          <div className="max-w-6xl mx-auto">
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">书籍不存在</div>
          </div>
        </AppShell>
        <SettingsModal
          open={showSettingsModal}
          onClose={() => {
            setShowSettingsModal(false);
            setSettingsFocusExtId("");
            void refreshExtensions();
          }}
          initialTab={settingsFocusExtId ? "extensions" : undefined}
          focusExtensionId={settingsFocusExtId || undefined}
        />
      </>
    );
  }

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentSelectionCount = selectedIds.size;

  const DEFAULT_PAGE_SIZE = 10;
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
    try {
      const saved = window.localStorage.getItem("mts_shelf_page_size");
      if (saved) { const n = parseInt(saved, 10); if ([10, 20, 50].includes(n)) return n; }
    } catch { /* ignore */ }
    return DEFAULT_PAGE_SIZE;
  });
  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPageIndex(1);
    try { window.localStorage.setItem("mts_shelf_page_size", String(size)); } catch { /* ignore */ }
  };

  const filteredChapters = useMemo(() => {
    if (isQuick) return [] as typeof allChapters;
    if (chapterFilter === "raw") return rawChapters;
    if (chapterFilter === "cooked") return cookedChapters;
    return allChapters;
  }, [isQuick, chapterFilter, rawChapters, cookedChapters, allChapters]);
  const totalCount = isQuick ? quickItems.length : filteredChapters.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    if (loading) return;
    setPageIndex((p) => Math.max(1, Math.min(totalPages, p)));
  }, [totalPages, loading]);

  const visibleChapters = useMemo(() => {
    if (isQuick) return [] as typeof allChapters;
    const start = (pageIndex - 1) * pageSize;
    return filteredChapters.slice(start, start + pageSize);
  }, [isQuick, filteredChapters, pageIndex, pageSize]);

  const visibleQuickItems = useMemo(() => {
    if (!isQuick) return [];
    const start = (pageIndex - 1) * pageSize;
    return quickItems.slice(start, start + pageSize);
  }, [isQuick, quickItems, pageIndex, pageSize]);

  const visibleSelectKeys = useMemo(() => {
    if (isQuick) return visibleQuickItems.map((it) => it.key);
    return visibleChapters.map((ch) => ch.id);
  }, [isQuick, visibleQuickItems, visibleChapters]);

  const [chapterCoverUrls, setChapterCoverUrls] = useState<Record<string, string>>({});
  const [hoverPreview, setHoverPreview] = useState<{ chapterId: string; x: number; y: number } | null>(null);

  const showChapterPreview = (chapterId: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setHoverPreview({ chapterId, x: rect.right + 8, y: rect.top });
  };
  const hideChapterPreview = () => setHoverPreview(null);

  useEffect(() => {
    let cancelled = false;
    const loadCovers = async () => {
      const urls: Record<string, string> = {};
      for (const ch of visibleChapters) {
        if (cancelled) break;
        if (chapterCoverUrls[ch.id]) continue;
        const firstPage = ch.pages?.[0];
        if (!firstPage) continue;
        const isCooked = (ch.kind || "raw") === "cooked";
        const blobKey = isCooked ? (firstPage.translatedBlobKey || firstPage.originalBlobKey) : firstPage.originalBlobKey;
        if (!blobKey) continue;
        try {
          const blob = await getBlob(blobKey);
          if (blob && !cancelled) {
            urls[ch.id] = URL.createObjectURL(blob);
          }
        } catch {
          // ignore
        }
      }
      if (!cancelled && Object.keys(urls).length > 0) {
        setChapterCoverUrls((prev) => ({ ...prev, ...urls }));
      }
    };
    void loadCovers();
    return () => { cancelled = true; };
  }, [visibleChapters]);

  useEffect(() => {
    let cancelled = false;
    const loadQuickCovers = async () => {
      const urls: Record<string, string> = {};
      for (const it of visibleQuickItems) {
        if (cancelled) break;
        if (chapterCoverUrls[it.key]) continue;
        if (!it.coverBlobKey) continue;
        try {
          const blob = await getBlob(it.coverBlobKey);
          if (blob && !cancelled) {
            urls[it.key] = URL.createObjectURL(blob);
          }
        } catch {
          // ignore
        }
      }
      if (!cancelled && Object.keys(urls).length > 0) {
        setChapterCoverUrls((prev) => ({ ...prev, ...urls }));
      }
    };
    void loadQuickCovers();
    return () => { cancelled = true; };
  }, [visibleQuickItems]);

  const allVisibleSelected = useMemo(() => {
    if (visibleSelectKeys.length === 0) return false;
    return visibleSelectKeys.every((k) => selectedIds.has(k));
  }, [visibleSelectKeys, selectedIds]);

  const toggleSelectAllVisible = () => {
    if (visibleSelectKeys.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const shouldClear = visibleSelectKeys.every((k) => next.has(k));
      for (const k of visibleSelectKeys) {
        if (shouldClear) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };


  const openDeleteConfirm = () => {
    if (currentSelectionCount === 0) return;
    setDeleteError("");
    setConfirmOpen(true);
  };

  const openTranslate = () => {
    if (isQuick) return;
    if (currentSelectionCount === 0) return;
    setTranslateError("");
    setTranslateJobIds([]);
    const selectedRaw = rawChapters.filter((c) => selectedIds.has(c.id));
    if (selectedRaw.length === 0) return;
    setTranslateTargets(selectedRaw.map((c) => ({ id: c.id, title: c.title, count: c.pages.length })));
    setTranslateOpen(true);
  };

  const startEditorPrepareFromChapter = async () => {
    if (translateLoading) return;
    if (isQuick) return;
    if (chapterFilter !== "raw") return;
    if (translateTargets.length === 0) return;
    if (translateTargets.length > 1) return;

    const selected = rawChapters.find((c) => translateTargets.some((t) => t.id === c.id));
    if (!selected) {
      setTranslateError("未找到选中的章节");
      return;
    }

    try { window.localStorage.setItem(STORAGE_KEY_LAST_LANG, translateTargetLang); } catch {}

    setTranslateLoading(true);
    setTranslateError("");
    setTranslateOpen(false);
    setShowProgressModal(true);
    setProgressError("");
    setProgressValue(0);
    setProgressStage("准备编辑项目");
    setProgressText(`0/${selected.pages.length}`);

    try {
      const files: File[] = [];
      for (const p of selected.pages || []) {
        const blob = await getBlob(p.originalBlobKey);
        if (!blob) continue;
        files.push(new File([blob], p.fileName, { type: blob.type || "image/png" }));
      }

      if (files.length === 0) {
        throw new Error("未找到可编辑的图片");
      }

      const total = files.length;

      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        const page = selected.pages[i];
        if (!page) continue;

        setProgressStage("扫描文本区域");
        setProgressText(`${i}/${total}`);

        const res = await scanMangaImage({
          file: f,
          lang: "auto",
          inpainter: advInpainter,
          detector: advDetector,
          detectionSize: advDetectionSize,
          inpaintingSize: advInpaintingSize,
          translator: advTranslator,
          targetLang: translateTargetLang,
          ocr: advOcrMode,
        });

        let translatedBlobKey: string | undefined;
        let translatedUrl: string | undefined;
        try {
          const base = res.cleanImage || res.translatedImage;
          const blob = await resolveImageToBlob(base);
          translatedBlobKey = await putBlob(blob, { dir: `${bookId}/${selected.id}` });
        } catch {
          translatedUrl = res.cleanImage || res.translatedImage;
        }

        updatePageInChapter(
          { bookId, chapterId: selected.id, pageId: page.id },
          (p) => ({
            ...p,
            imageSize: res.imageSize,
            regions: res.regions,
            translatedBlobKey,
            translatedUrl,
          })
        );

        const raw = Math.floor(((i + 1) / total) * 100);
        const eased = i + 1 >= total ? 100 : Math.min(99, Math.max(raw, progressValue));
        setProgressValue(eased);
        setProgressText(`${i + 1}/${total}`);
      }

      setBooks(loadLibrary());

      setProgressStage("完成");
      setProgressValue(100);
      setProgressText(`完成：${files.length}/${files.length}`);
      router.push(`/translate?bookId=${encodeURIComponent(bookId)}&chapterId=${encodeURIComponent(selected.id)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setProgressError(message);
      setProgressStage("失败");
    } finally {
      setTranslateLoading(false);
    }
  };

  const startTranslateSelected = async () => {
    if (translateLoading) return;
    if (isQuick) return;
    if (chapterFilter !== "raw") return;
    if (translateTargets.length === 0) return;

    if (!isApiKeyConfigured(advTranslator)) {
      const providerName = getProviderDisplayName(advTranslator);
      void alert({ title: "缺少 API Key", message: `翻译器 ${providerName} 需要配置 API Key 才能使用。请在设置 → 账号中填写。` });
      setShowSettingsModal(true);
      return;
    }

    setTranslateLoading(true);
    setTranslateError("");
    try {
      try { window.localStorage.setItem(STORAGE_KEY_LAST_LANG, translateTargetLang); } catch {}

      const selected = rawChapters.filter((c) => translateTargets.some((t) => t.id === c.id));
      if (selected.length === 0) throw new Error("请选择要翻译的生肉章节");

      const createdJobIds: string[] = [];
      for (const raw of selected) {
        const files: File[] = [];
        for (const p of raw.pages || []) {
          const blob = await getBlob(p.originalBlobKey);
          if (!blob) continue;
          files.push(new File([blob], p.fileName, { type: blob.type || "image/png" }));
        }
        if (files.length === 0) continue;

        let detectedLang = "ja";
        try {
          const probed = await probeLang({ file: files[0], detector: advDetector, detectionSize: advDetectionSize });
          if (probed?.detectedLang) detectedLang = probed.detectedLang;
        } catch {
          // ignore probe failures
        }

        const outChapter = createChapter(bookId, raw.title, { kind: "cooked" });
        const job = createJob({
          lang: detectedLang,
          inpainter: advInpainter,
          detector: advDetector,
          detectionSize: advDetectionSize,
          inpaintingSize: advInpaintingSize,
          translator: advTranslator,
          targetLang: translateTargetLang,
          ocr: advOcrMode,
          targetBookId: bookId,
          targetChapterId: outChapter.id,
          files: files.map((f) => ({ fileName: f.name })),
        });
        createdJobIds.push(job.id);
        void runBatchJob(job.id, files);
      }

      if (createdJobIds.length === 0) throw new Error("未找到可翻译的图片（可能已被删除）");

      setTranslateJobIds(createdJobIds);
      setTranslateOpen(false);
      setShowProgressModal(true);
      setProgressError("");
      setProgressValue(0);
      setProgressText(`0/${createdJobIds.reduce((s, id) => s + (jobById.get(id)?.total || 0), 0) || "-"}`);
      setProgressStage("翻译中");
      clearSelection();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setTranslateError(message);
    } finally {
      setTranslateLoading(false);
    }
  };

  const cancelProgress = () => {
    for (const id of translateJobIds) {
      try {
        cancelJob(id);
      } catch {
        // ignore
      }
    }
    setProgressError("已取消");
    setProgressStage("已取消");
  };

  const doDeleteSelected = async () => {
    if (deleteLoading) return;
    if (selectedIds.size === 0) return;

    setDeleteLoading(true);
    setDeleteError("");
    try {
      {
        const removed = removeChapters(bookId, Array.from(selectedIds));
        const keys: string[] = [];
        for (const ch of removed) {
          keys.push(...getAllBlobKeysFromChapter(ch));
        }
        for (const k of Array.from(new Set(keys))) {
          try {
            await deleteBlob(k);
          } catch {
            // ignore
          }
        }
      }
      clearSelection();
      setConfirmOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const isSupportedImageFile = (f: File) => {
    if ((f.type || "").startsWith("image/")) return true;
    const dot = f.name.lastIndexOf(".");
    const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
    return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"].includes(ext);
  };

  const addRawChapterFromFiles = async (files: File[], folderHint?: string) => {
    if (isQuick) return;
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    if (list.length === 0) return;

    const allImages = list.every((f) => isSupportedImageFile(f));
    if (!folderHint && list.length > 1 && !allImages) {
      setRawError("多选仅支持图片；压缩包/EPUB/PDF 等请单独选择");
      return;
    }

    if (allImages) {
      const title = folderHint ? folderHint : makeTimestampName();
      const chapter = createChapter(bookId, title);
      const blobDir = `${bookId}/${chapter.id}`;
      for (const f of list) {
        const key = await putBlob(f, { dir: blobDir, name: f.name });
        addPageToChapter(bookId, chapter.id, {
          id: crypto.randomUUID(),
          fileName: f.name,
          createdAt: Date.now(),
          originalBlobKey: key,
        });
      }
      setChapterFilter("raw");
      return;
    }

    // Single non-image file: zip/epub/pdf/cbz/cbr/rar/mobi etc -> extract to images
    const f = list[0];
    const { images, nameHint } = await importToImages({ file: f });
    const isSingleImage = images.length === 1 && isSupportedImageFile(f);
    const title = folderHint ? folderHint : isSingleImage ? makeTimestampName() : nameHint;
    const chapter = createChapter(bookId, title);
    const blobDir2 = `${bookId}/${chapter.id}`;
    for (const img of images) {
      const key = await putBlob(img, { dir: blobDir2, name: img.name });
      addPageToChapter(bookId, chapter.id, {
        id: crypto.randomUUID(),
        fileName: img.name,
        createdAt: Date.now(),
        originalBlobKey: key,
      });
    }
    setChapterFilter("raw");
  };

  const onPickRawFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setRawError("");
    if (files.length === 0) return;
    void (async () => {
      try {
        await addRawChapterFromFiles(files);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setRawError(message);
      }
    })();
  };

  const onDropRaw = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isQuick) return;
    setRawError("");

    const items = Array.from(e.dataTransfer.items ?? []);
    const entries = items
      .map((it) => (it as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.())
      .filter(Boolean) as FileSystemEntryLike[];
    const dirs = entries.filter((en) => en && en.isDirectory);
    if (dirs.length > 0) {
      if (dirs.length > 1 || entries.length > 1) {
        setRawError("请一次只拖入一个文件夹。若要导入多个文件，请使用“上传生肉”。");
        return;
      }
      const root = dirs[0];
      const name = sanitizeFolderName(String(root?.name || "文件夹"));

      const readAllEntries = async (dir: Pick<FileSystemEntryLike, "createReader">) => {
        const reader = dir.createReader?.();
        if (!reader) return [] as FileSystemEntryLike[];
        const all: FileSystemEntryLike[] = [];
        while (true) {
          const batch = (await new Promise<unknown[]>((resolve, reject) => {
            reader.readEntries(resolve, reject);
          })) as FileSystemEntryLike[];
          if (!batch || batch.length === 0) break;
          all.push(...batch);
        }
        return all;
      };

      const collect = async (ent: FileSystemEntryLike, prefix: string): Promise<Array<{ file: File; rel: string }>> => {
        if (ent.isFile) {
          const file: File = await new Promise((resolve, reject) => {
            ent.file?.(resolve, reject);
          });
          return [{ file, rel: `${prefix}${file.name}` }];
        }
        if (ent.isDirectory) {
          const children = await readAllEntries(ent as Pick<FileSystemEntryLike, "createReader">);
          const out: Array<{ file: File; rel: string }> = [];
          for (const ch of children) {
            const sub = await collect(ch, `${prefix}${ent.name || ""}/`);
            out.push(...sub);
          }
          return out;
        }
        return [];
      };

      void (async () => {
        try {
          const all = await collect(root, "");
          const imgs = all
            .filter((x) => isSupportedImageFile(x.file))
            .sort((a, b) => naturalCompare(a.rel, b.rel))
            .map((x) => x.file);
          if (imgs.length === 0) throw new Error("文件夹中未找到图片（支持 png/jpg/webp 等）");
          await addRawChapterFromFiles(imgs, name);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err ?? "Failed");
          setRawError(message);
        }
      })();
      return;
    }

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    void (async () => {
      try {
        await addRawChapterFromFiles(files);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setRawError(message);
      }
    })();
  };

  return (
    <>
      <AppShell title={headerTitle} breadcrumbs={[{ label: "书架", href: "/shelf" }, { label: headerTitle }]} onOpenSettings={() => setShowSettingsModal(true)}>
        <div className="view-section max-w-6xl mx-auto space-y-8 pb-10">
          {/* ── Book Info Section ── */}
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Background blur decoration */}
            {coverDisplayUrl && (
              <div className="absolute inset-0 overflow-hidden">
                <img src={coverDisplayUrl} alt="" className="w-full h-full object-cover blur-3xl scale-150 opacity-[0.07]" />
              </div>
            )}

            <div className="relative flex flex-col md:flex-row gap-6 p-6">
              {/* Cover */}
              {isQuick ? (
                <div className="w-24 md:w-28 aspect-[3/4] rounded-xl shadow-md overflow-hidden shrink-0 border border-slate-200 bg-white">
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-slate-400">翻译内容</div>
                </div>
              ) : (
                <div
                  className={`group/cover relative w-24 md:w-28 aspect-[3/4] rounded-xl shadow-md overflow-hidden shrink-0 border-2 transition-colors ${coverDragOver ? "border-indigo-400 ring-2 ring-indigo-200" : "border-white/80"}`}
                  onDragOver={(e) => { e.preventDefault(); setCoverDragOver(true); }}
                  onDragLeave={() => setCoverDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setCoverDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith("image/")) {
                      void (async () => {
                        try {
                          const key = await putBlob(file, { dir: `${bookId}/_covers`, name: file.name });
                          setBookCover({ bookId, coverBlobKey: key, coverUrl: undefined });
                        } catch { /* ignore */ }
                      })();
                    }
                  }}
                >
                  {coverDisplayUrl ? (
                    <img src={coverDisplayUrl} alt={headerTitle} className="w-full h-full object-cover transition-all duration-200 group-hover/cover:blur-[2px] group-hover/cover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300 text-xs">暂无封面</div>
                  )}
                  <div
                    className="absolute inset-0 bg-black/0 group-hover/cover:bg-black/30 transition-all duration-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <div className="opacity-0 group-hover/cover:opacity-100 transition-all duration-200 p-2.5 rounded-full bg-white shadow-lg">
                      <Import className="w-4 h-4 text-slate-600" />
                    </div>
                    <span className="opacity-0 group-hover/cover:opacity-100 transition-all duration-200 text-[11px] font-medium text-white drop-shadow">修改封面</span>
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void (async () => {
                        try {
                          const key = await putBlob(file, { dir: `${bookId}/_covers`, name: file.name });
                          setBookCover({ bookId, coverBlobKey: key, coverUrl: undefined });
                        } catch { /* ignore */ }
                      })();
                      e.target.value = "";
                    }}
                  />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-2xl font-bold text-slate-900 truncate">{headerTitle}</h1>
                      {!isQuick && (
                        <button
                          type="button"
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
                          onClick={() => setEditBookOpen(true)}
                          title="编辑书籍信息"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 mb-1.5">
                      <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                        创建 {chapterCreatedTs ? formatDate(chapterCreatedTs) : "-"}
                      </span>
                      <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                        更新 {chapterUpdatedTs ? formatDate(chapterUpdatedTs) : "-"}
                      </span>
                    </div>
                    <p className={`text-sm line-clamp-2 max-w-xl ${isQuick ? "text-slate-500" : book?.description ? "text-slate-500" : "text-slate-400 italic"}`}>
                      {isQuick ? "最近翻译结果" : book?.description || "暂无书籍介绍，点击编辑按钮添加"}
                    </p>
                  </div>

                  {!isQuick && (
                    <div ref={bookMenuRef} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setBookMenuOpen((v) => !v)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      {bookMenuOpen && (
                        <div className="absolute right-0 top-10 w-40 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-30">
                          <button type="button" className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 rounded-lg transition-colors" onClick={() => { setBookMenuOpen(false); setEditBookOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5" /> 编辑书籍
                          </button>
                          <button type="button" className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 rounded-lg transition-colors" onClick={() => { setBookMenuOpen(false); coverInputRef.current?.click(); }}>
                            <Import className="w-3.5 h-3.5" /> 更换封面
                          </button>
                          <div className="my-0.5 mx-1 h-px bg-slate-100" />
                          <button type="button" className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 hover:text-red-600 flex items-center gap-2 rounded-lg transition-colors" onClick={() => { setBookMenuOpen(false); void deleteCurrentBookAndCleanup(); }}>
                            <Trash2 className="w-3.5 h-3.5" /> 删除书籍
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isQuick && (
                  <div className="mt-auto pt-5">
                    <button
                      type="button"
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all flex items-center gap-1.5"
                      onClick={() => { clearSelection(); setPageIndex(1); setChapterFilter("raw"); rawInputRef.current?.click(); }}
                    >
                      <Upload className="w-3.5 h-3.5" /> 上传新章节
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar inside card */}
            {!isQuick && runningJobs.length > 0 && (
              <div className="relative border-t border-slate-100 px-6 py-4 bg-indigo-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-700">翻译进行中</span>
                  <span className="text-xs text-indigo-500">{runningDone}/{runningTotal}（{runningPct}%）</span>
                </div>
                <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${runningPct}%` }} />
                </div>
                <div className="mt-2 space-y-1">
                  {runningJobs.map((j) => {
                    const title = chapterTitleById.get(j.targetChapterId) || "章节";
                    const pct = j.total > 0 ? Math.min(100, Math.round((j.completed / j.total) * 100)) : 0;
                    return (
                      <div key={j.id} className="flex items-center justify-between text-[10px] text-indigo-600">
                        <span className="truncate">{title}</span>
                        <span>{j.completed}/{j.total}（{pct}%）</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="relative border-t border-red-100 px-6 py-3 bg-red-50/50">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* ── Chapter List Section (Demo-aligned) ── */}
          <div>
            {/* Sticky filter bar */}
            <div className="sticky top-0 z-20 -mt-4 pt-4 -mx-8 px-8 bg-slate-50">
              <div className="px-6 py-4 bg-white border border-slate-200 rounded-t-2xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex bg-white p-1 rounded-full border border-slate-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => { clearSelection(); setPageIndex(1); setChapterFilter("all"); setBatchMode(false); }}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 ${chapterFilter === "all" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                >
                  全部 <span className={chapterFilter === "all" ? "opacity-80" : "font-bold text-slate-600"}>{allCount}</span>
                </button>
                {!isQuick && (
                  <>
                    <button
                      type="button"
                      onClick={() => { clearSelection(); setPageIndex(1); setChapterFilter("raw"); setBatchMode(false); }}
                      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 ${chapterFilter === "raw" ? "bg-orange-100 text-orange-700 shadow-sm" : "font-medium text-slate-500 hover:text-slate-900"}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${chapterFilter === "raw" ? "bg-orange-500" : "bg-orange-500"}`} />
                      生肉 <span className={chapterFilter === "raw" ? "" : "font-bold text-orange-600"}>{rawCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { clearSelection(); setPageIndex(1); setChapterFilter("cooked"); setBatchMode(false); }}
                      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 ${chapterFilter === "cooked" ? "bg-indigo-100 text-indigo-700 shadow-sm" : "font-medium text-slate-500 hover:text-slate-900"}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${chapterFilter === "cooked" ? "bg-indigo-500" : "bg-indigo-500"}`} />
                      熟肉 <span className={chapterFilter === "cooked" ? "" : "font-bold text-indigo-600"}>{cookedCount}</span>
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {batchMode && currentSelectionCount > 0 && (
                  <>
                    {!isQuick && (chapterFilter === "raw" || chapterFilter === "all") && (
                      <button
                        type="button"
                        className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                        onClick={openTranslate}
                      >
                        翻译选中 ({currentSelectionCount})
                      </button>
                    )}
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      onClick={openDeleteConfirm}
                    >
                      删除 ({currentSelectionCount})
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { setBatchMode((v) => !v); if (batchMode) clearSelection(); }}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {batchMode ? "取消选择" : "批量选择"}
                </button>
              </div>
              </div>
            </div>

            <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 shadow-sm overflow-hidden">
            <input
              ref={rawInputRef}
              type="file"
              multiple
              accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff,.zip,.cbz,.cbr,.rar,.pdf,.epub,.mobi"
              className="hidden"
              onChange={onPickRawFiles}
            />

            <div
              className="divide-y divide-slate-100"
              onDragOver={(ev) => { if (!isQuick) ev.preventDefault(); }}
              onDrop={onDropRaw}
            >
              {rawError && <div className="px-6 py-3 bg-red-50 text-sm text-red-600">{rawError}</div>}

              {loading ? (
                <div className="px-6 py-12 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
                </div>
              ) : isQuick ? (
                quickItems.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-400 text-sm">暂无翻译内容</div>
                ) : (
                  <>
                    {visibleQuickItems.map((it) => (
                      <ChapterListItem
                        key={it.key}
                        itemKey={it.key}
                        title={it.title}
                        href={it.href}
                        coverUrl={chapterCoverUrls[it.key]}
                        isRaw={false}
                        pageCount={it.count}
                        dateLabel={formatDate(it.ts)}
                        batchMode={batchMode}
                        selected={selectedIds.has(it.key)}
                        onToggleSelect={() => toggleSelected(it.key)}
                        onNavigate={() => navigateToChapter(it.href)}
                        onShowPreview={(el) => showChapterPreview(it.key, el)}
                        onHidePreview={hideChapterPreview}
                        onOpenFolder={window.mts ? () => {
                          const chapter = book?.chapters.find((c) => c.id === it.id);
                          if (!chapter) return;
                          void openChapterFolder(bookId, chapter.id, chapter.pages);
                        } : undefined}
                        onRename={async () => {
                          const newTitle = await prompt({ title: "重命名章节", defaultValue: it.title, placeholder: "请输入新名称" });
                          if (newTitle && newTitle !== it.title) {
                            renameChapter({ bookId, chapterId: it.id, title: newTitle });
                            setBooks(loadLibrary());
                          }
                        }}
                        onDelete={() => {
                          setSelectedIds(new Set([it.key]));
                          setDeleteError("");
                          setConfirmOpen(true);
                        }}
                      />
                    ))}
                    {totalCount > 10 && (
                      <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end bg-slate-50/50">
                        <Pagination pageIndex={pageIndex} totalPages={totalPages} pageSize={pageSize} onPageChange={setPageIndex} onPageSizeChange={handlePageSizeChange} />
                      </div>
                    )}
                  </>
                )
              ) : filteredChapters.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-slate-400 text-sm">
                    {chapterFilter === "raw" ? "暂无生肉内容" : chapterFilter === "cooked" ? "暂无熟肉内容" : "暂无章节"}
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    {chapterFilter === "raw" ? "点击\"上传新章节\"或拖拽文件到此处导入" : chapterFilter === "cooked" ? "请先在生肉中导入内容并进行翻译" : "点击\"上传新章节\"开始添加内容"}
                  </p>
                </div>
              ) : (
                <>
                  {visibleChapters.map((ch) => {
                    const chapterKind = (ch.kind || "raw") as string;
                    const isRaw = chapterKind === "raw";
                    const chapterHref = `/shelf/${encodeURIComponent(bookId)}/${encodeURIComponent(ch.id)}`;
                    return (
                      <ChapterListItem
                        key={ch.id}
                        itemKey={ch.id}
                        title={ch.title}
                        href={chapterHref}
                        coverUrl={chapterCoverUrls[ch.id]}
                        isRaw={isRaw}
                        pageCount={ch.pages.length}
                        dateLabel={formatDate(ch.updatedAt || ch.createdAt)}
                        batchMode={batchMode}
                        selected={selectedIds.has(ch.id)}
                        onToggleSelect={() => toggleSelected(ch.id)}
                        onNavigate={() => navigateToChapter(chapterHref)}
                        onShowPreview={(el) => showChapterPreview(ch.id, el)}
                        onHidePreview={hideChapterPreview}
                        onTranslate={isRaw ? () => {
                          setSelectedIds(new Set([ch.id]));
                          setTranslateError("");
                          setTranslateJobIds([]);
                          setTranslateTargets([{ id: ch.id, title: ch.title, count: ch.pages.length }]);
                          setTranslateOpen(true);
                        } : undefined}
                        onOpenFolder={window.mts ? () => {
                          void openChapterFolder(bookId, ch.id, ch.pages);
                        } : undefined}
                        onRename={async () => {
                          const newTitle = await prompt({ title: "重命名章节", defaultValue: ch.title, placeholder: "请输入新名称" });
                          if (newTitle && newTitle !== ch.title) {
                            renameChapter({ bookId, chapterId: ch.id, title: newTitle });
                            setBooks(loadLibrary());
                          }
                        }}
                        onDelete={() => {
                          setSelectedIds(new Set([ch.id]));
                          setDeleteError("");
                          setConfirmOpen(true);
                        }}
                      />
                    );
                  })}
                  {totalCount > 10 && (
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end bg-slate-50/50">
                      <Pagination pageIndex={pageIndex} totalPages={totalPages} pageSize={pageSize} onPageChange={setPageIndex} onPageSizeChange={handlePageSizeChange} />
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
          </div>
        </div>
      </AppShell>

      {hoverPreview && chapterCoverUrls[hoverPreview.chapterId] && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: Math.min(hoverPreview.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 208),
            top: Math.max(0, Math.min(hoverPreview.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 320)),
          }}
        >
          <div className="w-48 rounded-xl overflow-hidden shadow-2xl border border-slate-200 bg-white">
            <img src={chapterCoverUrls[hoverPreview.chapterId]} alt="" className="w-full aspect-[3/4] object-cover object-top" />
          </div>
        </div>
      )}

      {/* ── Translate Modal ── */}
      <TranslateModal
        open={translateOpen}
        onClose={() => { setTranslateOpen(false); setTranslateError(""); }}
        title="翻译章节"
        sourceLang={translateSourceLang}
        onSourceLangChange={setTranslateSourceLang}
        targetLang={translateTargetLang}
        onTargetLangChange={setTranslateTargetLang}
        defaultLang={defaultLang}
        onDefaultLangChange={handleDefaultLangChange}
        langDisabled={translateLoading || translateJobIds.length > 0}
        advanced={{
          detectionSize: advDetectionSize,
          inpaintingSize: advInpaintingSize,
          detector: advDetector,
          translator: advTranslator,
          inpainter: advInpainter,
          ocrMode: advOcrMode,
          onDetectionSizeChange: setAdvDetectionSize,
          onInpaintingSizeChange: setAdvInpaintingSize,
          onDetectorChange: setAdvDetector,
          onTranslatorChange: setAdvTranslator,
          onInpainterChange: setAdvInpainter,
          onOcrModeChange: setAdvOcrMode,
          installedExtensions: installedById,
          onRequireExtension: ensureExtensionOrOpenSettings,
        }}
        advancedDisabled={translateLoading || translateJobIds.length > 0}
        error={translateError}
        warning={translateTargets.length > 1 ? "多章节暂不支持编辑翻译" : undefined}
        loading={translateLoading}
        autoTranslateDisabled={translateLoading || translateTargets.length === 0 || translateJobIds.length > 0}
        onAutoTranslate={() => void startTranslateSelected()}
        editorDisabled={translateLoading || translateTargets.length === 0 || translateTargets.length > 1 || translateJobIds.length > 0}
        onEditorTranslate={() => void startEditorPrepareFromChapter()}
      >
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="text-xs text-slate-500 mb-2">已选择 {translateTargets.length} 个章节</div>
          <div className="max-h-24 overflow-auto space-y-1">
            {translateTargets.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium truncate">{c.title}</span>
                <span className="text-slate-400 shrink-0 ml-2">{c.count} 张</span>
              </div>
            ))}
          </div>
        </div>
      </TranslateModal>

      <ProgressModal
        open={showProgressModal}
        title={progressTitle}
        taskLabel={book?.title || "-"}
        stage={progressStage}
        progressText={progressText}
        progressValue={progressValue}
        error={progressError}
        successCount={progressSuccessCount}
        failedCount={progressFailedCount}
        totalCount={progressTotalCount}
        onCancel={cancelProgress}
        onClose={() => setShowProgressModal(false)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="确认删除"
        message={`将删除 ${currentSelectionCount} 个章节，且无法恢复，是否继续？`}
        error={deleteError}
        loading={deleteLoading}
        confirmLabel="确认删除"
        loadingLabel="删除中…"
        onCancel={() => { setConfirmOpen(false); setDeleteError(""); }}
        onConfirm={() => void doDeleteSelected()}
      />

      <BookEditModal
        mode="edit"
        open={editBookOpen}
        onClose={() => setEditBookOpen(false)}
        bookId={bookId}
        initialTitle={book?.title}
        initialDescription={book?.description}
      />

      <SettingsModal
        open={showSettingsModal}
        onClose={() => {
          setShowSettingsModal(false);
          setSettingsFocusExtId("");
          void refreshExtensions();
        }}
        initialTab={settingsFocusExtId ? "extensions" : undefined}
        focusExtensionId={settingsFocusExtId || undefined}
      />
    </>
  );
}
