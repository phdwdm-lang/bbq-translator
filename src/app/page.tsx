"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Upload, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { AppShell } from "../components/layout/AppShell";

import { importToImages, makeTaskFolderName } from "../lib/importExtract";
import { naturalCompare, isSupportedImageFile, sanitizeFolderName, makeTimestampName } from "../lib/utils";
import { STORAGE_KEY_DEFAULT_LANG, STORAGE_KEY_LAST_LANG, DEFAULT_INITIAL_LANG } from "../constants/languages";
import type { FileSystemEntryLike } from "../types/fileSystem";
import {
  listExtensions,
  resolveImageToBlob,
  scanMangaImage,
  isMissingApiKeyError,
  type ExtensionItem,
} from "../lib/translateClient";
import { isApiKeyConfigured, getProviderDisplayName } from "../constants/credentials";
import { putBlob, getBlob, deleteBlob } from "../lib/blobDb";
import { addPageToChapter, addPageToWorkspace, createChapter, createEditorWorkspace, clearEditorWorkspace, getWorkspaceBlobKeys, ensureQuickBook, loadLibrary, notifyMitChange, QUICK_BOOK_ID, subscribeLibrary, removeChapters } from "../lib/storage";
import { SettingsModal } from "../components/SettingsModal";
import { useDialog } from "../components/common/DialogProvider";
import { ProgressModal } from "../components/common/ProgressModal";
import { TranslateModal } from "../components/common/TranslateModal";
import { TranslatingCard } from "../components/common/TranslatingCard";
import { useTranslationProgress } from "../hooks/useTranslationProgress";
import {
  startTranslation,
  updateTranslationProgress,
  finishTranslation,
  setTranslationModalOpen,
  closeAndCleanupTask,
  getTaskById,
  resolveTranslationStageTitle,
  TRANSLATION_STAGE_CANCELED,
  TRANSLATION_STAGE_DONE,
  TRANSLATION_STAGE_FAILED,
  TRANSLATION_STAGE_PARSE_FILES,
  TRANSLATION_STAGE_PREPARE_EDITOR,
  TRANSLATION_STAGE_SCAN_REGIONS,
  TRANSLATION_STAGE_TRANSLATING,
} from "../lib/translationProgress";
import { DETECTION_RESOLUTION, INPAINTING_SIZE } from "../constants/editor";
import { useTranslateParams } from "../hooks/useTranslateParams";
import type { ElectronMts } from "../types/electron";

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const abortersRef = useRef<Map<string, AbortController>>(new Map());
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsFocusExtId, setSettingsFocusExtId] = useState<string>("");


  const startEditorPrepare = async () => {
    if (!selectedFile) return;
    if (importLoading) return;
    if (importedImages.length === 0) {
      setImportError("未找到可编辑的图片");
      return;
    }

    try { window.localStorage.setItem(STORAGE_KEY_LAST_LANG, targetLanguage); } catch {}

    setShowImportModal(false);
    const editorTaskId = crypto.randomUUID();
    const chapterTitle = selectedName || makeTimestampName();
    startTranslation(editorTaskId, chapterTitle);
    updateTranslationProgress(editorTaskId, { stage: TRANSLATION_STAGE_PREPARE_EDITOR, value: 0, text: `0/${importedImages.length}`, error: "" });

    const aborter = new AbortController();
    abortersRef.current.set(editorTaskId, aborter);

    try {
      createEditorWorkspace(chapterTitle);

      const total = importedImages.length;
      for (let i = 0; i < importedImages.length; i += 1) {
        if (aborter.signal.aborted) throw new Error("已取消");
        const f = importedImages[i];
        updateTranslationProgress(editorTaskId, { stage: TRANSLATION_STAGE_SCAN_REGIONS, text: `${i}/${total}` });

        const originalKey = await putBlob(f, { dir: `${QUICK_BOOK_ID}/_workspace`, name: f.name });

        const res = await scanMangaImage({
          file: f,
          lang: "auto",
          inpainter: advInpainter,
          detector: advDetector,
          detectionSize: advDetectionSize,
          inpaintingSize: advInpaintingSize,
          translator: advTranslator,
          targetLang: targetLanguage,
          ocr: advOcrMode,
          signal: aborter.signal,
        });

        let translatedBlobKey: string | undefined;
        let translatedUrl: string | undefined;
        try {
          const base = res.cleanImage || res.translatedImage;
          const blob = await resolveImageToBlob(base);
          translatedBlobKey = await putBlob(blob, { dir: `${QUICK_BOOK_ID}/_workspace`, name: f.name });
        } catch {
          translatedUrl = res.cleanImage || res.translatedImage;
        }

        addPageToWorkspace({
          id: crypto.randomUUID(),
          fileName: f.name,
          createdAt: Date.now(),
          imageSize: res.imageSize,
          regions: res.regions,
          originalBlobKey: originalKey,
          translatedBlobKey,
          translatedUrl,
        });

        const raw = Math.floor(((i + 1) / total) * 100);
        const prevValue = getTaskById(editorTaskId)?.value ?? 0;
        const eased = i + 1 >= total ? 100 : Math.min(99, Math.max(raw, prevValue));
        updateTranslationProgress(editorTaskId, { value: eased, text: `${i + 1}/${total}` });
      }

      finishTranslation(editorTaskId, TRANSLATION_STAGE_DONE);
      updateTranslationProgress(editorTaskId, { text: `完成：${importedImages.length}/${importedImages.length}` });
      setTranslationModalOpen(false);
      router.push("/translate?workspace=1");
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : String(err ?? "Failed");
      if (isMissingApiKeyError(err)) {
        const providerLabel = err.provider && err.provider !== "unknown" ? `【${err.provider}】` : "";
        message = `${providerLabel}API Key 未配置或已失效，请在设置 → 账号中检查 Key 是否正确及余额是否充足`;
      }
      finishTranslation(editorTaskId, message === TRANSLATION_STAGE_CANCELED ? TRANSLATION_STAGE_CANCELED : TRANSLATION_STAGE_FAILED, { error: message });

      const blobKeys = getWorkspaceBlobKeys();
      clearEditorWorkspace();
      for (const k of blobKeys) {
        try { await deleteBlob(k); } catch { /* ignore */ }
      }
    } finally {
      abortersRef.current.delete(editorTaskId);
    }
  };

  type RecentChapterItem = {
    key: string;
    bookId: string;
    chapterId: string;
    title: string;
    updatedAt: number;
    pageCount: number;
    coverBlobKey?: string;
    coverUrl?: string;
  };

  const [localChapters, setLocalChapters] = useState<RecentChapterItem[]>([]);
  const [recentCoverUrls, setRecentCoverUrls] = useState<Record<string, string>>({});

  const [showImportModal, setShowImportModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [importedImages, setImportedImages] = useState<File[]>([]);
  const [taskId, setTaskId] = useState<string>("");

  const [sourceLanguage, setSourceLanguage] = useState<string>("auto");
  const [defaultLang, setDefaultLang] = useState<string>(() => {
    try { return window.localStorage.getItem(STORAGE_KEY_DEFAULT_LANG) || ""; } catch { return ""; }
  });
  const [targetLanguage, setTargetLanguage] = useState<string>(() => {
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

  const {
    detectionResolution: advDetectionSize, setDetectionResolution: setAdvDetectionSize,
    inpaintingSize: advInpaintingSize, setInpaintingSize: setAdvInpaintingSize,
    textDetector: advDetector, setTextDetector: setAdvDetector,
    translator: advTranslator, setTranslator: setAdvTranslator,
    ocrMode: advOcrMode, setOcrMode: setAdvOcrMode,
    inpainter: advInpainter, setInpainter: setAdvInpainter,
  } = useTranslateParams();

  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);

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

  const tp = useTranslationProgress();

  const { alert: showAlert } = useDialog();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const advancedOptionDisabled = importLoading || importedImages.length === 0;

  const ensureExtensionOrOpenSettings = (extId: string, title: string) => {
    const installed = installedById.get(extId);
    if (installed) return true;
    void showAlert({ title: "提示", message: `该功能需要先安装 ${title} 拓展包。` });
    setSettingsFocusExtId(extId);
    setShowSettingsModal(true);
    return false;
  };

  const loadLocalChapters = () => {
    const books = loadLibrary();
    const quickBook = books.find((b) => b.id === QUICK_BOOK_ID);
    if (!quickBook) {
      setLocalChapters([]);
      return;
    }
    const items: RecentChapterItem[] = quickBook.chapters
      .map((chapter) => ({
        key: `local:${chapter.id}`,
        bookId: QUICK_BOOK_ID,
        chapterId: chapter.id,
        title: chapter.title || quickBook.title,
        updatedAt: chapter.updatedAt || chapter.createdAt,
        pageCount: chapter.pages?.length ?? 0,
        coverBlobKey: chapter.coverBlobKey,
        coverUrl: chapter.coverUrl,
      }));
    setLocalChapters(items);
  };

  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem("mts_default_target_lang") : null;
      if (saved) setTargetLanguage(saved);
    } catch {
      // ignore
    }
    loadLocalChapters();
    return subscribeLibrary(() => {
      loadLocalChapters();
    });
  }, []);

  const recentChapters = useMemo((): RecentChapterItem[] => {
    return [...localChapters].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [localChapters]);

  useEffect(() => {
    let cancelled = false;
    const loadCovers = async () => {
      const toLoad = recentChapters.filter(
        (item) => item.coverBlobKey && !recentCoverUrls[item.chapterId],
      );
      if (toLoad.length === 0) return;
      const entries = await Promise.all(
        toLoad.map(async (item) => {
          try {
            const blob = await getBlob(item.coverBlobKey!);
            if (blob) return [item.chapterId, URL.createObjectURL(blob)] as const;
          } catch { /* ignore */ }
          return null;
        }),
      );
      if (cancelled) return;
      const urls: Record<string, string> = {};
      for (const entry of entries) {
        if (entry) urls[entry[0]] = entry[1];
      }
      if (Object.keys(urls).length > 0) {
        setRecentCoverUrls((prev) => ({ ...prev, ...urls }));
      }
    };
    void loadCovers();
    return () => {
      cancelled = true;
    };
  }, [recentChapters]);

  useEffect(() => {
    void refreshExtensions();
  }, []);

  const beginImport = (f: File, displayName?: string) => {
    setSelectedFile(f);
    setSelectedName(displayName ?? f.name);
    setShowImportModal(true);
    setImportLoading(true);
    setImportError("");
    setImportedImages([]);

    importAbortRef.current?.abort();
    const aborter = new AbortController();
    importAbortRef.current = aborter;

    void (async () => {
      try {
        const { images, nameHint } = await importToImages({ file: f, signal: aborter.signal });
        setImportedImages(images);

        const isSingleImage = images.length === 1 && isSupportedImageFile(f);
        const chapterTitle = displayName ?? (isSingleImage ? makeTimestampName() : nameHint);
        setSelectedName(chapterTitle);
        setTaskId(makeTaskFolderName(chapterTitle));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setImportError(message);
      } finally {
        setImportLoading(false);
      }
    })();
  };

  const beginImportImages = (files: File[], displayName: string) => {
    const list = [...files];
    list.sort((a, b) => {
      const ap = (a as unknown as { webkitRelativePath?: string }).webkitRelativePath || "";
      const bp = (b as unknown as { webkitRelativePath?: string }).webkitRelativePath || "";
      if (ap && bp) return ap.localeCompare(bp);
      return a.name.localeCompare(b.name);
    });

    setSelectedFile(list[0] ?? null);
    setSelectedName(displayName);
    setShowImportModal(true);
    setImportLoading(false);
    setImportError("");
    setImportedImages(list);
    setTaskId(makeTaskFolderName(displayName));
  };

  const pickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (list.length === 0) return;

    if (list.length > 1) {
      const allImages = list.every((f) => (f.type || "").startsWith("image/"));
      if (allImages) {
        beginImportImages(list, makeTimestampName());
        return;
      }
    }

    beginImport(list[0]);
  };

  const pickFolder = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (list.length === 0) return;

    const images = list.filter((f) => isSupportedImageFile(f));
    if (images.length === 0) {
      setSelectedFile(null);
      setSelectedName("文件夹导入");
      setShowImportModal(true);
      setImportLoading(false);
      setImportError("文件夹中未找到图片（支持 png/jpg/webp 等）。");
      setImportedImages([]);
      return;
    }

    const firstPath = (list[0] as unknown as { webkitRelativePath?: string }).webkitRelativePath || "";
    const folderName = sanitizeFolderName(firstPath.split("/")[0] || "文件夹");
    beginImportImages(images, folderName);
  };

  const base64ToBlob = (base64: string, mime: string) => {
    const bin = typeof window !== "undefined" ? window.atob(base64) : "";
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const dropImport = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const items = Array.from(e.dataTransfer.items ?? []);

    const entries = items
      .map((it) => (it as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.())
      .filter(Boolean) as unknown as FileSystemEntryLike[];

    const directoryEntries = entries.filter((en) => en && en.isDirectory);
    if (directoryEntries.length > 0) {
      if (directoryEntries.length > 1 || entries.length > 1) {
        setSelectedFile(null);
        setSelectedName("文件夹导入");
        setShowImportModal(true);
        setImportLoading(false);
        setImportError("请一次只拖入一个文件夹。若要导入多个文件，请使用“上传”选择文件。");
        setImportedImages([]);
        return;
      }

      const root = directoryEntries[0];
      const rootName = sanitizeFolderName(root.name || "文件夹");

      const readAllEntries = async (dir: Pick<FileSystemEntryLike, "createReader">) => {
        const reader = dir.createReader();
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
          const f: File = await new Promise((resolve, reject) => {
            ent.file(resolve, reject);
          });
          return [{ file: f, rel: `${prefix}${f.name}` }];
        }
        if (ent.isDirectory) {
          const children = await readAllEntries(ent);
          const out: Array<{ file: File; rel: string }> = [];
          for (const ch of children) {
            const sub = await collect(ch, `${prefix}${ent.name}/`);
            out.push(...sub);
          }
          return out;
        }
        return [];
      };

      try {
        const all = await collect(root, "");
        const imgs = all
          .filter((x) => isSupportedImageFile(x.file))
          .sort((a, b) => naturalCompare(a.rel, b.rel))
          .map((x) => {
            const f = x.file as File & { webkitRelativePath?: string };
            try {
              Object.defineProperty(f, "webkitRelativePath", { value: x.rel, configurable: true });
            } catch {
              // ignore
            }
            return f;
          });
        if (imgs.length === 0) {
          setSelectedFile(null);
          setSelectedName(rootName);
          setShowImportModal(true);
          setImportLoading(false);
          setImportError("文件夹中未找到图片（支持 png/jpg/webp 等）。");
          setImportedImages([]);
          return;
        }
        beginImportImages(imgs, rootName);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setSelectedFile(null);
        setSelectedName("导入失败");
        setShowImportModal(true);
        setImportLoading(false);
        setImportError(message);
        setImportedImages([]);
      }
      return;
    }

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    if (files.length > 1 && files.every((f) => (f.type || "").startsWith("image/"))) {
      beginImportImages(files, makeTimestampName());
      return;
    }
    beginImport(files[0]);
  };

  const openImportDialog = async () => {
    const mts = (typeof window !== "undefined" ? (window as unknown as { mts?: ElectronMts }).mts : undefined) as ElectronMts | undefined;
    if (!mts || typeof mts.openImportDialog !== "function") {
      inputRef.current?.click();
      return;
    }

    const res = await mts.openImportDialog();
    if (!res || res.canceled) return;

    const entries: Array<{ path: string; isDirectory: boolean }> = Array.isArray(res.entries) ? res.entries : [];
    if (entries.length === 0) return;

    try {
      const fileEntries = entries.filter((e) => e && !e.isDirectory);
      if (fileEntries.length === 0) return;

      const out: File[] = [];
      for (const ent of fileEntries) {
        const r = await mts.readFile(ent.path);
        if (!r || !r.ok) continue;
        const blob = base64ToBlob(r.base64 || "", r.mime || "application/octet-stream");
        out.push(new File([blob], r.name || "file", { type: r.mime || "application/octet-stream" }));
      }

      if (out.length === 0) return;

      const allImages = out.every((f) => (f.type || "").startsWith("image/"));
      if (out.length > 1) {
        if (!allImages) {
          setSelectedFile(out[0]);
          setSelectedName("选择的文件包含非图片格式");
          setShowImportModal(true);
          setImportLoading(false);
          setImportError("多选仅支持图片；压缩包/EPUB/PDF 等请单独选择");
          setImportedImages([]);
          return;
        }
        beginImportImages(out, makeTimestampName());
        return;
      }

      beginImport(out[0]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setSelectedFile(null);
      setSelectedName("导入失败");
      setShowImportModal(true);
      setImportLoading(false);
      setImportError(message);
      setImportedImages([]);
    }
  };

  const startAutoTranslate = async () => {
    if (!selectedFile) return;
    if (importLoading) return;
    if (importedImages.length === 0) {
      setImportError("未找到可翻译的图片");
      return;
    }

    if (!isApiKeyConfigured(advTranslator)) {
      const providerName = getProviderDisplayName(advTranslator);
      void showAlert({ title: "缺少 API Key", message: `翻译器 ${providerName} 需要配置 API Key 才能使用。请在设置 → 账号中填写。` });
      setShowSettingsModal(true);
      return;
    }

    try { window.localStorage.setItem(STORAGE_KEY_LAST_LANG, targetLanguage); } catch {}

    ensureQuickBook();
    const chapterTitle = selectedName || makeTimestampName();
    const autoTaskId = crypto.randomUUID();

    setShowImportModal(false);
    const firstCoverUrl = importedImages.length > 0 ? URL.createObjectURL(importedImages[0]) : "";
    const total = importedImages.length;
    startTranslation(autoTaskId, chapterTitle, { coverUrl: firstCoverUrl, totalCount: total });
    updateTranslationProgress(autoTaskId, { stage: TRANSLATION_STAGE_PARSE_FILES, value: 0, text: `0/${total}`, error: "" });

    const aborter = new AbortController();
    abortersRef.current.set(autoTaskId, aborter);

    let successCount = 0;
    let failedCount = 0;
    let apiKeyError = false;
    const pendingPages: Array<{ fileName: string; blob: Blob }> = [];

    try {
      for (let i = 0; i < importedImages.length; i += 1) {
        if (aborter.signal.aborted) throw new Error("已取消");
        const f = importedImages[i];
        updateTranslationProgress(autoTaskId, { stage: TRANSLATION_STAGE_TRANSLATING, text: `${i}/${total}` });

        try {
          const res = await scanMangaImage({
            file: f,
            lang: "auto",
            inpainter: advInpainter,
            detector: advDetector,
            detectionSize: advDetectionSize,
            inpaintingSize: advInpaintingSize,
            translator: advTranslator,
            targetLang: targetLanguage,
            ocr: advOcrMode,
            signal: aborter.signal,
          });
          const blob = await resolveImageToBlob(res.translatedImage);
          pendingPages.push({ fileName: f.name, blob });
          successCount += 1;
        } catch (pageErr: unknown) {
          if (aborter.signal.aborted) throw new Error("已取消");
          if (isMissingApiKeyError(pageErr)) {
            apiKeyError = true;
            const providerLabel = pageErr.provider && pageErr.provider !== "unknown" ? `【${pageErr.provider}】` : "";
            throw new Error(`${providerLabel}API Key 未配置或已失效，请在设置 → 账号中检查 Key 是否正确及余额是否充足`);
          }
          failedCount += 1;
        }

        const raw = Math.floor(((i + 1) / total) * 100);
        const prevValue = getTaskById(autoTaskId)?.value ?? 0;
        const eased = i + 1 >= total ? 100 : Math.min(99, Math.max(raw, prevValue));
        updateTranslationProgress(autoTaskId, { value: eased, text: `${i + 1}/${total}`, successCount, failedCount });
      }

      if (pendingPages.length === 0) {
        throw new Error("所有图片翻译失败，未创建章节");
      }

      const chapter = createChapter(QUICK_BOOK_ID, chapterTitle, { kind: "cooked" });
      for (const p of pendingPages) {
        const blobKey = await putBlob(p.blob, { dir: `${QUICK_BOOK_ID}/${chapter.id}`, name: p.fileName });
        addPageToChapter(QUICK_BOOK_ID, chapter.id, {
          id: crypto.randomUUID(),
          fileName: p.fileName,
          createdAt: Date.now(),
          originalBlobKey: blobKey,
          translatedBlobKey: blobKey,
        });
      }

      const finalStage = failedCount > 0 ? TRANSLATION_STAGE_FAILED : TRANSLATION_STAGE_DONE;
      finishTranslation(autoTaskId, finalStage, failedCount > 0 ? { error: `${failedCount} 张图片翻译失败` } : undefined);
      updateTranslationProgress(autoTaskId, { successCount, failedCount, totalCount: total });
      notifyMitChange();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      const stage = message === TRANSLATION_STAGE_CANCELED ? TRANSLATION_STAGE_CANCELED : TRANSLATION_STAGE_FAILED;
      
      if (apiKeyError && pendingPages.length > 0) {
        const chapter = createChapter(QUICK_BOOK_ID, chapterTitle, { kind: "cooked" });
        for (const p of pendingPages) {
          const blobKey = await putBlob(p.blob, { dir: `${QUICK_BOOK_ID}/${chapter.id}`, name: p.fileName });
          addPageToChapter(QUICK_BOOK_ID, chapter.id, {
            id: crypto.randomUUID(),
            fileName: p.fileName,
            createdAt: Date.now(),
            originalBlobKey: blobKey,
            translatedBlobKey: blobKey,
          });
        }
        notifyMitChange();
      }

      finishTranslation(autoTaskId, stage, { error: message });
      updateTranslationProgress(autoTaskId, { successCount, failedCount, totalCount: total });
      if (!apiKeyError || pendingPages.length === 0) {
        notifyMitChange();
      }
    } finally {
      abortersRef.current.delete(autoTaskId);
    }
  };

  const cancelProgress = () => {
    const tid = tp.modalTaskId;
    const aborter = abortersRef.current.get(tid);
    if (aborter) aborter.abort();
    finishTranslation(tid, TRANSLATION_STAGE_CANCELED, { error: TRANSLATION_STAGE_CANCELED });
  };

  const activeTasks = useMemo(() => tp.tasks.filter((t) => t.active), [tp.tasks]);
  const activeTaskCount = activeTasks.length;
  const MAX_RECENT_ITEMS = Math.max(1, 5 - activeTaskCount);
  const activeTaskIds = useMemo(() => new Set(activeTasks.map((t) => t.id)), [activeTasks]);
  const activeTaskTitles = useMemo(() => new Set(activeTasks.map((t) => t.title)), [activeTasks]);
  const recentItems = useMemo(() => {
    const filtered = activeTaskCount > 0
      ? recentChapters.filter((it) => {
          if (activeTaskIds.has(it.chapterId)) return false;
          if (activeTaskTitles.has(it.title)) return false;
          return true;
        })
      : recentChapters;
    return filtered.slice(0, MAX_RECENT_ITEMS);
  }, [recentChapters, MAX_RECENT_ITEMS, activeTaskCount, activeTaskIds, activeTaskTitles]);
  const modalTask = useMemo(() => tp.tasks.find((t) => t.id === tp.modalTaskId), [tp.tasks, tp.modalTaskId]);
  const progressTitle = resolveTranslationStageTitle(modalTask?.stage || "");

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff,.zip,.cbz,.cbr,.rar,.pdf,.epub,.mobi"
        className="hidden"
        onChange={pickFiles}
      />
      <input
        ref={(el) => {
          folderInputRef.current = el;
          if (el) {
            el.setAttribute("webkitdirectory", "");
            el.setAttribute("directory", "");
          }
        }}
        type="file"
        multiple
        className="hidden"
        onChange={pickFolder}
      />

      <AppShell title="概览" onOpenSettings={() => setShowSettingsModal(true)}>
        <div className="view-section max-w-6xl mx-auto space-y-10 pb-10">
          {/* ── Hero Section ── */}
          <section>
            <div
              className="bg-white rounded-xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.10)] border border-slate-100 w-full flex flex-row items-stretch"
              style={{ overflow: "visible" }}
            >
              {/* Left Column: Text Area (40%) */}
              <div className="w-[40%] flex flex-col justify-center items-start space-y-3 pl-8 pr-5 py-7">
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#FFF7ED] text-[#EA580C] text-xs font-bold tracking-wide">
                  投喂生肉区
                </div>
                <h2 className="text-[1.5rem] font-black text-[#0F172A] tracking-tight leading-[1.2]">
                  准备好开始料理了吗？
                </h2>
                <p className="text-[#64748B] text-[13px] leading-relaxed font-medium">
                  上传生肉漫画，自动去字、翻译、嵌字，为您端上热腾腾的熟肉。
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void openImportDialog()}
                    className="bg-[#0F172A] hover:bg-[#1E293B] text-white px-5 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <Upload className="w-4 h-4" />
                    上传生肉
                  </button>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all hover:bg-slate-50"
                  >
                    导入文件夹
                  </button>
                </div>
              </div>

              {/* Right Column: Drop Zone (60%) */}
              <div
                className="w-[60%] m-4 rounded-[1.5rem] border-2 border-dashed border-[#C7D2FE] bg-[#F5F7FF] hover:border-[#818CF8] transition-colors duration-300 relative flex items-center group cursor-pointer"
                style={{ overflow: "visible" }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={dropImport}
                onClick={() => void openImportDialog()}
              >
                {/* Mascot: fills full dropzone height */}
                <div className="absolute top-0 bottom-0 left-[-15px] z-10 pointer-events-none float-on-hover">
                  <img
                    src="/images/mascot-dropzone.png"
                    alt="Mascot"
                    className="h-full w-auto object-contain"
                    style={{ filter: "drop-shadow(0 10px 30px rgba(99, 102, 241, 0.18))" }}
                  />
                </div>

                {/* Drop Zone Content: pinned to right edge */}
                <div className="absolute right-6 top-0 bottom-0 w-[240px] flex flex-col items-center justify-center z-10">
                  <div className="w-14 h-14 rounded-[1rem] bg-white text-[#6366F1] flex items-center justify-center shadow-[0_8px_20px_-4px_rgba(99,102,241,0.2)] mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-[#334155] mb-2 tracking-tight group-hover:text-[#4F46E5] transition-colors">
                    拖拽文件到此处
                  </h3>
                  <div className="text-sm text-[#94A3B8] font-medium text-center leading-6">
                    <p>支持 Epub / Zip / PDF</p>
                    <p>CBR / RAR 或 图片文件夹</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Recent Cooking Section ── */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                最近料理
              </h3>
              <Link href="/shelf" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                前往书架 <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {activeTasks.map((t) => (
                <TranslatingCard
                  key={t.id}
                  title={t.title || "未命名项目"}
                  progressValue={t.value}
                  progressText={t.text}
                  stage={t.stage}
                  coverUrl={t.coverUrl}
                />
              ))}

              {recentItems.map((it) => {
                const coverUrl = recentCoverUrls[it.chapterId] || it.coverUrl || "";
                return (
                  <Link
                    key={it.key}
                    href={`/shelf/${encodeURIComponent(it.bookId)}/${encodeURIComponent(it.chapterId)}`}
                    className="group cursor-pointer"
                  >
                    <div className="aspect-[3/4] bg-slate-200 rounded-xl overflow-hidden relative shadow-md card-hover group-hover:ring-4 ring-indigo-100 transition-all">
                      {coverUrl ? (
                        <img src={coverUrl} alt={it.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                      <div className="absolute top-2 left-2">
                        <span className="px-2 py-1 rounded-md bg-indigo-600 text-white text-[10px] font-bold shadow-sm flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> 熟肉
                        </span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <h4 className="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-600 transition-colors">{it.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(it.updatedAt).toLocaleDateString("zh-CN")}{it.pageCount > 0 && ` • ${it.pageCount}页`}
                      </p>
                    </div>
                  </Link>
                );
              })}

              {recentItems.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
                  <ImageIcon className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">还没有翻译过的漫画</p>
                  <p className="text-xs mt-1">上传生肉开始你的第一次料理吧</p>
                </div>
              )}
            </div>
          </section>

          {/* FAQ Section hidden — content not yet implemented */}
        </div>
      </AppShell>

      <SettingsModal
        open={showSettingsModal}
        onClose={() => {
          setShowSettingsModal(false);
          setSettingsFocusExtId("");
          void refreshExtensions();
        }}
        initialTab="extensions"
        focusExtensionId={settingsFocusExtId || undefined}
      />

      {/* ── Import Modal ── */}
      <TranslateModal
        open={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setSelectedFile(null);
          setSelectedName("");
          setImportedImages([]);
          setImportError("");
          importAbortRef.current?.abort();
        }}
        title="开始翻译"
        sourceLang={sourceLanguage}
        onSourceLangChange={setSourceLanguage}
        targetLang={targetLanguage}
        onTargetLangChange={setTargetLanguage}
        defaultLang={defaultLang}
        onDefaultLangChange={handleDefaultLangChange}
        langDisabled={importLoading || importedImages.length === 0}
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
        advancedDisabled={advancedOptionDisabled}
        error={importError}
        autoTranslateDisabled={importLoading || importedImages.length === 0}
        onAutoTranslate={() => void startAutoTranslate()}
        editorDisabled={importLoading || importedImages.length === 0}
        onEditorTranslate={() => void startEditorPrepare()}
      >
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">已选文件</label>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">{selectedName || selectedFile?.name || "-"}</div>
              <div className="text-xs text-slate-500">
                {importLoading ? "解析中…" : `${importedImages.length} 张图片`}
              </div>
            </div>
          </div>
        </div>
      </TranslateModal>

      <ProgressModal
        open={tp.modalOpen}
        title={progressTitle}
        taskLabel={modalTask?.title || "-"}
        stage={modalTask?.stage || ""}
        progressText={modalTask?.text || ""}
        progressValue={modalTask?.value ?? 0}
        error={modalTask?.error}
        successCount={modalTask?.successCount ?? 0}
        failedCount={modalTask?.failedCount ?? 0}
        totalCount={modalTask?.totalCount ?? 0}
        onCancel={cancelProgress}
        onClose={() => closeAndCleanupTask(tp.modalTaskId)}
      />
    </>
  );
}
