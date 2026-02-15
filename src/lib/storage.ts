import { IS_ELECTRON } from "./env";
import * as desktopStore from "./desktopStorage";

function storageGetItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  if (IS_ELECTRON) return desktopStore.getItem(key);
  return window.localStorage.getItem(key);
}

function storageSetItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  if (IS_ELECTRON) {
    desktopStore.setItem(key, value);
    return;
  }
  window.localStorage.setItem(key, value);
}

export type TextRegion = {
  box: [number, number, number, number];
  text_original: string;
  text_translated: string;
  polygon?: [number, number][];
  angle?: number;
  font_size?: number;
  direction?: string;
  alignment?: string;
  letter_spacing?: number;
  line_spacing?: number;
  fg_color?: [number, number, number] | null;
  bg_color?: [number, number, number] | null;
  font_family?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  stroke_color?: string;
  stroke_width?: number;
};

export type MangaPage = {
  id: string;
  fileName: string;
  createdAt: number;
  imageSize?: [number, number];
  regions?: TextRegion[];
  originalBlobKey: string;
  translatedBlobKey?: string;
  translatedUrl?: string;
  renderedBlobKey?: string;
  renderedUrl?: string;
};

export type MangaChapterKind = "raw" | "cooked";

export type MangaChapter = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt?: number;
  kind?: MangaChapterKind;
  coverBlobKey?: string;
  coverUrl?: string;
  pages: MangaPage[];
};

export type MangaBook = {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  coverBlobKey?: string;
  coverUrl?: string;
  chapters: MangaChapter[];
};

export type JobItemStatus = "pending" | "running" | "success" | "error";
export type JobStatus = "pending" | "running" | "success" | "error";

export type BatchJobItem = {
  id: string;
  fileName: string;
  status: JobItemStatus;
  originalBlobKey?: string;
  error?: string;
};

export type BatchJob = {
  id: string;
  createdAt: number;
  status: JobStatus;
  lang: string;
  inpainter?: string;
  detector?: string;
  detectionSize?: number;
  inpaintingSize?: number;
  translator?: string;
  targetLang?: string;
  ocr?: string;
  targetBookId: string;
  targetChapterId: string;
  total: number;
  completed: number;
  currentIndex: number;
  items: BatchJobItem[];
};

const LIBRARY_KEY = "mit.library.v1";
const JOBS_KEY = "mit.jobs.v1";
export const QUICK_BOOK_ID = "quick-translate";

const MIT_LIBRARY_EVENT = "mit-library-change";
const MIT_JOBS_EVENT = "mit-jobs-change";

const LEGACY_LIBRARY_KEYS = ["mit.library", "mit.library.v0", "mts.library", "mts.library.v1"];
const LEGACY_JOBS_KEYS = ["mit.jobs", "mit.jobs.v0", "mts.jobs", "mts.jobs.v1"];

function emitLibraryChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MIT_LIBRARY_EVENT));
}

function emitJobsChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MIT_JOBS_EVENT));
}

export function notifyMitChange() {
  emitLibraryChange();
  emitJobsChange();
}

export function subscribe(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LIBRARY_KEY || e.key === JOBS_KEY) listener();
  };
  window.addEventListener(MIT_LIBRARY_EVENT, listener);
  window.addEventListener(MIT_JOBS_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MIT_LIBRARY_EVENT, listener);
    window.removeEventListener(MIT_JOBS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function subscribeLibrary(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LIBRARY_KEY) listener();
  };
  window.addEventListener(MIT_LIBRARY_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MIT_LIBRARY_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function subscribeJobs(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === JOBS_KEY) listener();
  };
  window.addEventListener(MIT_JOBS_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MIT_JOBS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isMangaBookArray(value: unknown): value is MangaBook[] {
  if (!Array.isArray(value)) return false;
  return value.every((it) => it && typeof it === "object" && typeof (it as MangaBook).id === "string" && Array.isArray((it as MangaBook).chapters));
}

function isBatchJobArray(value: unknown): value is BatchJob[] {
  if (!Array.isArray(value)) return false;
  return value.every((it) => it && typeof it === "object" && typeof (it as BatchJob).id === "string" && Array.isArray((it as BatchJob).items));
}

function migrateIfMissing<T>(params: {
  targetKey: string;
  legacyKeys: string[];
  validate: (value: unknown) => value is T;
}): void {
  if (typeof window === "undefined") return;
  if (IS_ELECTRON) return;
  try {
    const existing = window.localStorage.getItem(params.targetKey);
    if (existing) return;
    for (const k of params.legacyKeys) {
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = safeParseJson<unknown>(raw, null);
      if (params.validate(parsed)) {
        window.localStorage.setItem(params.targetKey, JSON.stringify(parsed));
        return;
      }
    }
  } catch {
    return;
  }
}

export function loadLibrary(): MangaBook[] {
  if (typeof window === "undefined") return [];
  migrateIfMissing<MangaBook[]>({ targetKey: LIBRARY_KEY, legacyKeys: LEGACY_LIBRARY_KEYS, validate: isMangaBookArray });
  return safeParseJson<MangaBook[]>(storageGetItem(LIBRARY_KEY), []);
}

export function saveLibrary(books: MangaBook[]) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(books);
  if (IS_ELECTRON) {
    desktopStore.setItem(LIBRARY_KEY, serialized);
  } else {
    const prev = window.localStorage.getItem(LIBRARY_KEY);
    try {
      window.localStorage.setItem(LIBRARY_KEY, serialized);
    } catch {
      if (prev !== null) {
        try { window.localStorage.setItem(LIBRARY_KEY, prev); } catch { /* last resort */ }
      }
      throw new Error("localStorage quota exceeded \u2013 library not saved");
    }
  }
  emitLibraryChange();
}

export function loadJobs(): BatchJob[] {
  if (typeof window === "undefined") return [];
  migrateIfMissing<BatchJob[]>({ targetKey: JOBS_KEY, legacyKeys: LEGACY_JOBS_KEYS, validate: isBatchJobArray });
  return safeParseJson<BatchJob[]>(storageGetItem(JOBS_KEY), []);
}

export function saveJobs(jobs: BatchJob[]) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(jobs);
  if (IS_ELECTRON) {
    desktopStore.setItem(JOBS_KEY, serialized);
  } else {
    const prev = window.localStorage.getItem(JOBS_KEY);
    try {
      window.localStorage.setItem(JOBS_KEY, serialized);
    } catch {
      if (prev !== null) {
        try { window.localStorage.setItem(JOBS_KEY, prev); } catch { /* last resort */ }
      }
      throw new Error("localStorage quota exceeded \u2013 jobs not saved");
    }
  }
  emitJobsChange();
}

export function ensureQuickBook(): MangaBook {
  const books = loadLibrary();
  let quick = books.find((b) => b.id === QUICK_BOOK_ID);
  if (!quick) {
    quick = {
      id: QUICK_BOOK_ID,
      title: "翻译内容",
      createdAt: Date.now(),
      coverBlobKey: undefined,
      coverUrl: undefined,
      chapters: [],
    };
    saveLibrary([quick, ...books]);
  }
  return quick;
}

export function createBook(title: string, params?: { coverBlobKey?: string; coverUrl?: string; description?: string }): MangaBook {
  const book: MangaBook = {
    id: crypto.randomUUID(),
    title,
    description: params?.description,
    createdAt: Date.now(),
    coverBlobKey: params?.coverBlobKey,
    coverUrl: params?.coverUrl,
    chapters: [],
  };
  const books = loadLibrary();
  saveLibrary([book, ...books]);
  return book;
}

export function defaultChapterTitle(chapterNumber: number) {
  return `第${chapterNumber}话`;
}

export function createChapter(bookId: string, title: string, params?: { kind?: MangaChapterKind }): MangaChapter {
  const books = loadLibrary();
  const idx = books.findIndex((b) => b.id === bookId);
  if (idx === -1) throw new Error("Book not found");

  const chapter: MangaChapter = {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    kind: params?.kind ?? "raw",
    coverBlobKey: undefined,
    coverUrl: undefined,
    pages: [],
  };

  const book = books[idx];
  const updated: MangaBook = {
    ...book,
    chapters: [chapter, ...book.chapters],
  };

  const next = books.slice();
  next[idx] = updated;
  saveLibrary(next);
  return chapter;
}

export function setChapterKind(params: { bookId: string; chapterId: string; kind: MangaChapterKind }) {
  const books = loadLibrary();
  const bookIdx = books.findIndex((b) => b.id === params.bookId);
  if (bookIdx === -1) throw new Error("Book not found");

  const book = books[bookIdx];
  const chapterIdx = book.chapters.findIndex((c) => c.id === params.chapterId);
  if (chapterIdx === -1) throw new Error("Chapter not found");

  const chapter = book.chapters[chapterIdx];
  const updatedChapter: MangaChapter = {
    ...chapter,
    kind: params.kind,
    updatedAt: Date.now(),
  };

  const updatedBook: MangaBook = {
    ...book,
    chapters: book.chapters.map((c) => (c.id === params.chapterId ? updatedChapter : c)),
  };

  const next = books.slice();
  next[bookIdx] = updatedBook;
  saveLibrary(next);
}

export function setBookCover(params: { bookId: string; coverBlobKey?: string; coverUrl?: string }) {
  const books = loadLibrary();
  const idx = books.findIndex((b) => b.id === params.bookId);
  if (idx === -1) throw new Error("Book not found");

  const book = books[idx];
  const updated: MangaBook = {
    ...book,
    coverBlobKey: params.coverBlobKey,
    coverUrl: params.coverUrl,
  };

  const next = books.slice();
  next[idx] = updated;
  saveLibrary(next);
}

export function deleteBook(bookId: string): MangaBook | null {
  if (!bookId) return null;
  if (bookId === QUICK_BOOK_ID) throw new Error("Cannot delete system book");

  const books = loadLibrary();
  const idx = books.findIndex((b) => b.id === bookId);
  if (idx === -1) return null;

  const removed = books[idx];
  const nextBooks = books.slice();
  nextBooks.splice(idx, 1);
  saveLibrary(nextBooks);

  const jobs = loadJobs();
  if (jobs.length) {
    const remaining = jobs.filter((j) => j.targetBookId !== bookId);
    if (remaining.length !== jobs.length) saveJobs(remaining);
  }

  return removed;
}

export function renameBook(params: { bookId: string; title: string; description?: string }) {
  const t = (params.title || "").trim();
  if (!t) throw new Error("Invalid book title");

  const books = loadLibrary();
  const idx = books.findIndex((b) => b.id === params.bookId);
  if (idx === -1) throw new Error("Book not found");

  const book = books[idx];
  const updated: MangaBook = {
    ...book,
    title: t,
    description: params.description,
  };

  const next = books.slice();
  next[idx] = updated;
  saveLibrary(next);
}

export function renameChapter(params: { bookId: string; chapterId: string; title: string }) {
  const t = (params.title || "").trim();
  if (!t) throw new Error("Invalid chapter title");

  const books = loadLibrary();
  const bookIdx = books.findIndex((b) => b.id === params.bookId);
  if (bookIdx === -1) throw new Error("Book not found");

  const book = books[bookIdx];
  const chapterIdx = book.chapters.findIndex((c) => c.id === params.chapterId);
  if (chapterIdx === -1) throw new Error("Chapter not found");

  const updatedChapter: MangaChapter = { ...book.chapters[chapterIdx], title: t };
  const updatedBook: MangaBook = {
    ...book,
    chapters: book.chapters.map((c) => (c.id === params.chapterId ? updatedChapter : c)),
  };

  const next = books.slice();
  next[bookIdx] = updatedBook;
  saveLibrary(next);
}

export function removeBookCover(bookId: string) {
  setBookCover({ bookId, coverBlobKey: undefined, coverUrl: undefined });
}

export function removeChapters(bookId: string, chapterIds: string[]): MangaChapter[] {
  const ids = Array.from(new Set((chapterIds || []).filter(Boolean)));
  if (ids.length === 0) return [];

  const books = loadLibrary();
  const bookIdx = books.findIndex((b) => b.id === bookId);
  if (bookIdx === -1) throw new Error("Book not found");

  const book = books[bookIdx];
  const removed: MangaChapter[] = [];
  const remaining: MangaChapter[] = [];
  for (const ch of book.chapters) {
    if (ids.includes(ch.id)) removed.push(ch);
    else remaining.push(ch);
  }

  const updatedBook: MangaBook = {
    ...book,
    chapters: remaining,
  };

  const next = books.slice();
  next[bookIdx] = updatedBook;
  saveLibrary(next);
  return removed;
}

export function setChapterCover(params: { bookId: string; chapterId: string; coverBlobKey?: string; coverUrl?: string }) {
  const books = loadLibrary();
  const bookIdx = books.findIndex((b) => b.id === params.bookId);
  if (bookIdx === -1) throw new Error("Book not found");

  const book = books[bookIdx];
  const chapterIdx = book.chapters.findIndex((c) => c.id === params.chapterId);
  if (chapterIdx === -1) throw new Error("Chapter not found");

  const chapter = book.chapters[chapterIdx];
  const updatedChapter: MangaChapter = {
    ...chapter,
    coverBlobKey: params.coverBlobKey,
    coverUrl: params.coverUrl,
  };

  const updatedBook: MangaBook = {
    ...book,
    chapters: book.chapters.map((c) => (c.id === params.chapterId ? updatedChapter : c)),
  };

  const next = books.slice();
  next[bookIdx] = updatedBook;
  saveLibrary(next);
}

export function updatePageInChapter(
  params: { bookId: string; chapterId: string; pageId: string },
  updater: (page: MangaPage) => MangaPage,
): MangaPage {
  const books = loadLibrary();
  const bookIdx = books.findIndex((b) => b.id === params.bookId);
  if (bookIdx === -1) throw new Error("Book not found");

  const book = books[bookIdx];
  const chapterIdx = book.chapters.findIndex((c) => c.id === params.chapterId);
  if (chapterIdx === -1) throw new Error("Chapter not found");

  const chapter = book.chapters[chapterIdx];
  const pageIdx = chapter.pages.findIndex((p) => p.id === params.pageId);
  if (pageIdx === -1) throw new Error("Page not found");

  const nextPage = updater(chapter.pages[pageIdx]);

  const nextChapter: MangaChapter = {
    ...chapter,
    updatedAt: Date.now(),
    pages: chapter.pages.map((p, idx) => (idx === pageIdx ? nextPage : p)),
  };

  const nextBook: MangaBook = {
    ...book,
    chapters: book.chapters.map((c, idx) => (idx === chapterIdx ? nextChapter : c)),
  };

  const next = books.slice();
  next[bookIdx] = nextBook;
  saveLibrary(next);
  return nextPage;
}

export function addPageToChapter(bookId: string, chapterId: string, page: MangaPage) {
  const books = loadLibrary();
  const bookIdx = books.findIndex((b) => b.id === bookId);
  if (bookIdx === -1) throw new Error("Book not found");

  const book = books[bookIdx];
  const chapterIdx = book.chapters.findIndex((c) => c.id === chapterId);
  if (chapterIdx === -1) throw new Error("Chapter not found");

  const chapter = book.chapters[chapterIdx];
  const nextChapterCoverBlobKey =
    chapter.coverBlobKey ?? page.translatedBlobKey ?? page.originalBlobKey;
  const nextChapterCoverUrl = chapter.coverUrl ?? page.translatedUrl;
  const updatedChapter: MangaChapter = {
    ...chapter,
    coverBlobKey: nextChapterCoverBlobKey,
    coverUrl: nextChapterCoverUrl,
    updatedAt: Date.now(),
    pages: [...chapter.pages, page],
  };

  const updatedBook: MangaBook = {
    ...book,
    chapters: book.chapters.map((c) => (c.id === chapterId ? updatedChapter : c)),
  };

  const next = books.slice();
  next[bookIdx] = updatedBook;
  saveLibrary(next);
}

export function createJob(params: {
  lang: string;
  inpainter?: string;
  detector?: string;
  detectionSize?: number;
  inpaintingSize?: number;
  translator?: string;
  targetLang?: string;
  ocr?: string;
  targetBookId: string;
  targetChapterId: string;
  files: { fileName: string }[];
}): BatchJob {
  const job: BatchJob = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: "pending",
    lang: params.lang,
    inpainter: params.inpainter,
    detector: params.detector,
    detectionSize: params.detectionSize,
    inpaintingSize: params.inpaintingSize,
    translator: params.translator,
    targetLang: params.targetLang,
    ocr: params.ocr,
    targetBookId: params.targetBookId,
    targetChapterId: params.targetChapterId,
    total: params.files.length,
    completed: 0,
    currentIndex: 0,
    items: params.files.map((f) => ({ id: crypto.randomUUID(), fileName: f.fileName, status: "pending" })),
  };

  const jobs = loadJobs();
  saveJobs([job, ...jobs]);
  return job;
}

export function updateJob(jobId: string, updater: (job: BatchJob) => BatchJob): BatchJob {
  const jobs = loadJobs();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx === -1) throw new Error("Job not found");
  const updated = updater(jobs[idx]);
  const next = jobs.slice();
  next[idx] = updated;
  saveJobs(next);
  return updated;
}

export function setJobStatus(jobId: string, status: JobStatus) {
  updateJob(jobId, (job) => ({ ...job, status }));
}

export function setJobItem(jobId: string, itemIndex: number, patch: Partial<BatchJobItem>) {
  updateJob(jobId, (job) => {
    const items = job.items.slice();
    items[itemIndex] = { ...items[itemIndex], ...patch };
    return { ...job, items };
  });
}

export function setJobProgress(jobId: string, patch: Partial<Pick<BatchJob, "completed" | "currentIndex" | "status">>) {
  updateJob(jobId, (job) => ({ ...job, ...patch }));
}

export function getAllBlobKeysFromPage(page: MangaPage): string[] {
  return [
    page.originalBlobKey,
    page.translatedBlobKey,
    page.renderedBlobKey,
  ].filter((k): k is string => Boolean(k));
}

export function getAllBlobKeysFromChapter(chapter: MangaChapter): string[] {
  const keys: string[] = [];
  if (chapter.coverBlobKey) keys.push(chapter.coverBlobKey);
  for (const page of chapter.pages || []) {
    keys.push(...getAllBlobKeysFromPage(page));
  }
  return keys;
}

export function getAllBlobKeysFromBook(book: MangaBook): string[] {
  const keys: string[] = [];
  if (book.coverBlobKey) keys.push(book.coverBlobKey);
  for (const chapter of book.chapters || []) {
    keys.push(...getAllBlobKeysFromChapter(chapter));
  }
  return keys;
}

export function collectAllReferencedBlobKeys(): Set<string> {
  const books = loadLibrary();
  const keys = new Set<string>();
  for (const book of books) {
    for (const key of getAllBlobKeysFromBook(book)) {
      keys.add(key);
    }
  }
  return keys;
}

export type PageImageType = "original" | "translated" | "rendered";

export function getPageBlobKeyAndUrl(
  page: MangaPage,
  type: PageImageType
): { blobKey?: string; url?: string } {
  switch (type) {
    case "original":
      return { blobKey: page.originalBlobKey, url: undefined };
    case "translated":
      return { blobKey: page.translatedBlobKey, url: page.translatedUrl };
    case "rendered":
      return { blobKey: page.renderedBlobKey, url: page.renderedUrl };
  }
}

/**
 * 统一解析页面图片 URL，优先从 IndexedDB 获取 Blob，fallback 到直接 URL
 * @param page 页面对象
 * @param type 图片类型
 * @param getBlobFn 获取 Blob 的函数（避免循环依赖）
 * @returns Object URL 或直接 URL，无可用资源时返回 null
 */
export async function resolvePageImageUrl(
  page: MangaPage,
  type: PageImageType,
  getBlobFn: (key: string) => Promise<Blob | null>
): Promise<string | null> {
  const { blobKey, url } = getPageBlobKeyAndUrl(page, type);

  if (blobKey) {
    const blob = await getBlobFn(blobKey);
    if (blob) return URL.createObjectURL(blob);
  }

  return url || null;
}

// ─────────────────────────────────────────────────────────────
// Editor Workspace（临时工作区，与 book library 解耦）
// ─────────────────────────────────────────────────────────────

const WORKSPACE_KEY = "mit.editor.workspace";

export type EditorWorkspace = {
  title: string;
  pages: MangaPage[];
  createdAt: number;
};

export function createEditorWorkspace(title: string): EditorWorkspace {
  const ws: EditorWorkspace = { title, pages: [], createdAt: Date.now() };
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
  return ws;
}

export function loadEditorWorkspace(): EditorWorkspace | null {
  return safeParseJson<EditorWorkspace | null>(
    window.localStorage.getItem(WORKSPACE_KEY),
    null,
  );
}

export function addPageToWorkspace(page: MangaPage): void {
  const ws = loadEditorWorkspace();
  if (!ws) throw new Error("Editor workspace not found");
  ws.pages.push(page);
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
}

export function updatePageInWorkspace(
  pageId: string,
  updater: (page: MangaPage) => MangaPage,
): void {
  const ws = loadEditorWorkspace();
  if (!ws) throw new Error("Editor workspace not found");
  const idx = ws.pages.findIndex((p) => p.id === pageId);
  if (idx === -1) throw new Error("Page not found in workspace");
  ws.pages[idx] = updater(ws.pages[idx]);
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
}

export function clearEditorWorkspace(): void {
  window.localStorage.removeItem(WORKSPACE_KEY);
}

export function getWorkspaceBlobKeys(): string[] {
  const ws = loadEditorWorkspace();
  if (!ws) return [];
  return ws.pages.flatMap(getAllBlobKeysFromPage);
}

// ─────────────────────────────────────────────────────────────
// localStorage 容量监控
// ─────────────────────────────────────────────────────────────

const STORAGE_WARNING_THRESHOLD = 4 * 1024 * 1024; // 4MB 警告阈值

export function getLocalStorageUsage(): { used: number; librarySize: number } {
  let total = 0;
  let librarySize = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key) || "";
      const size = (key.length + value.length) * 2; // UTF-16 每字符 2 字节
      total += size;
      if (key === LIBRARY_KEY) librarySize = size;
    }
  }

  return { used: total, librarySize };
}

export function checkStorageCapacity(): {
  isNearLimit: boolean;
  used: number;
  librarySize: number;
  message?: string;
} {
  const { used, librarySize } = getLocalStorageUsage();
  const isNearLimit = used > STORAGE_WARNING_THRESHOLD;

  return {
    isNearLimit,
    used,
    librarySize,
    message: isNearLimit
      ? `localStorage 使用量 ${(used / 1024 / 1024).toFixed(2)}MB，接近上限`
      : undefined,
  };
}
