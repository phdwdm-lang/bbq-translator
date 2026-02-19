"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  isSupportedImageFile, resolveFilesToImages,
} from "../../lib/importExtract";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { TopBar } from "../../components/TopBar";
import {
  startTranslation,
  updateTranslationProgress,
  finishTranslation,
  closeAndCleanupTask,
  setTranslationModalOpen,
} from "../../lib/translationProgress";
import { deleteBlob, getBlob, putBlob } from "../../lib/blobDb";
import { addPageToChapter, createChapter, clearEditorWorkspace, getAllBlobKeysFromChapter, getWorkspaceBlobKeys, loadEditorWorkspace, loadLibrary, QUICK_BOOK_ID, removeChapters, updatePageInChapter, updatePageInWorkspace, type MangaPage, type TextRegion } from "../../lib/storage";

import { CustomSelect } from "../../components/common/CustomSelect";
import { EditorLayout } from "../../components/editor/EditorLayout";
import { EditorHeader } from "../../components/editor/EditorHeader";
import { EditorNavLeft } from "../../components/editor/EditorNavLeft";
import { EditorPanelRight } from "../../components/editor/EditorPanelRight";
import type { EditorRegion, DrawingRect } from "../../types/editor";
import { useTranslateParams } from "../../hooks/useTranslateParams";
import { useEditorState } from "../../hooks/useEditorState";
import { useFileImport } from "../../hooks/useFileImport";
import { naturalCompare, getBasename, sanitizeFolderName, makeTimestampName } from "../../lib/utils";
import { TARGET_LANGUAGE_OPTIONS } from "../../constants/languages";
import { DETECTION_SIZE_OPTIONS, DIRECTION_HORIZONTAL, INPAINTING_SIZE_OPTIONS } from "../../constants/editor";
import { OCR_OPTIONS, VALID_TRANSLATORS } from "../../constants/translate";
import { useDialog } from "../../components/common/DialogProvider";
import { resolveImageToBlob, renderMangaPage, probeLang, scanMangaImage } from "../../lib/translateClient";
import { getBackendUrl } from "../../lib/env";
import { normalizeDirection } from "../../lib/editorUtils";
import dynamic from "next/dynamic";

const EditorWorkspace = dynamic(() => import("../../components/editor/EditorWorkspace").then((m) => m.EditorWorkspace), {
  ssr: false,
});

function TranslatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm: showConfirm, alert: showAlert } = useDialog();
  const bookIdFromQuery = searchParams.get("bookId") || "";
  const chapterIdFromQuery = searchParams.get("chapterId") || "";
  const workspaceMode = searchParams.get("workspace") === "1";
  const editorMode = Boolean(bookIdFromQuery && chapterIdFromQuery) || workspaceMode;

  const {
    lang, setLang,
    inpainter, setInpainter,
    showAdvanced, setShowAdvanced,
    detectionResolution, setDetectionResolution,
    textDetector, setTextDetector,
    translator, setTranslator,
    targetLanguage, setTargetLanguage,
    inpaintingSize, setInpaintingSize,
    ocrMode, setOcrMode,
  } = useTranslateParams();

  const {
    files, setFiles,
    importName, setImportName,
    regionsCount, setRegionsCount,
    status, setStatus,
    error, setError,
    detectedLang, setDetectedLang,
    usedOcr, setUsedOcr,
    inputRef, abortRef,
  } = useFileImport();

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [translatedUrl, setTranslatedUrl] = useState<string | null>(null);

  const {
    editorPages, setEditorPages,
    editorPageIndex, setEditorPageIndex,
    editorBaseUrl, setEditorBaseUrl,
    editorRegions, setEditorRegions,
    editingId, setEditingId,
    editingValue, setEditingValue,
    selectedIds, setSelectedIds,
    editorImgNatural, setEditorImgNatural,
    editorScale, setEditorScale,
    editorProjectError, setEditorProjectError,
    editorShowOriginal, setEditorShowOriginal,
    editorSaving, setEditorSaving,
    editorSaveProgress, setEditorSaveProgress,
    editorUseBackendPreview, setEditorUseBackendPreview,
    editorDirtyRegionIds, setEditorDirtyRegionIds,
    editorWrapRef, editorCanvasRef, editorRenderSeqRef, editorUrlRef,
    editorBackendBaselineRef, revokeEditorUrls,
    editorActiveTool, setEditorActiveTool,
  } = useEditorState();

  type DirectoryHandle = FileSystemDirectoryHandle;
  const [outputDir, setOutputDir] = useState<DirectoryHandle | null>(null);
  const [outputDirName, setOutputDirName] = useState<string>("");

  const ensureOutputDirPermission = useCallback(async (handle: DirectoryHandle) => {
    const h = handle as unknown as {
      queryPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
      requestPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
    };
    if (!h.queryPermission || !h.requestPermission) return;
    const q = await h.queryPermission.call(handle, { mode: "readwrite" });
    if (q === "granted") return;
    const r = await h.requestPermission.call(handle, { mode: "readwrite" });
    if (r !== "granted") {
      throw new Error("输出目录权限未授予（需要允许读写权限）");
    }
  }, []);

  type BatchItemStatus = "pending" | "running" | "success" | "error";
  type BatchItem = {
    id: string;
    file: File;
    status: BatchItemStatus;
    error?: string;
    detectedLang?: string;
    usedOcr?: string;
  };

  const loadEditorPage = useCallback(async (pages: MangaPage[], idx: number) => {
    const page = pages[idx];
    if (!page) throw new Error("Page not found");

    revokeEditorUrls();

    let nextOriginal: string | null = null;
    try {
      const blob = await getBlob(page.originalBlobKey);
      if (blob) nextOriginal = URL.createObjectURL(blob);
    } catch {
      nextOriginal = null;
    }

    let nextBase: string | null = null;
    if (page.translatedBlobKey) {
      try {
        const blob = await getBlob(page.translatedBlobKey);
        if (blob) nextBase = URL.createObjectURL(blob);
      } catch {
        nextBase = null;
      }
    }
    if (!nextBase) nextBase = page.translatedUrl || null;

    let nextRendered: string | null = null;
    if (page.renderedBlobKey) {
      try {
        const blob = await getBlob(page.renderedBlobKey);
        if (blob) nextRendered = URL.createObjectURL(blob);
      } catch {
        nextRendered = null;
      }
    }
    if (!nextRendered) nextRendered = page.renderedUrl || null;

    if (nextOriginal) editorUrlRef.current.original = nextOriginal;
    if (nextBase) editorUrlRef.current.base = nextBase;
    if (nextRendered) editorUrlRef.current.rendered = nextRendered;

    setOriginalUrl(nextOriginal);
    setTranslatedUrl(nextBase);

    setEditorUseBackendPreview(false);
    setEditorBaseUrl(nextBase);
    setEditingId(null);
    setEditingValue("");
    const nextEditorRegions = (page.regions ?? []).map((rg, regionIndex) => {
      // Convert storage format to Konva-friendly format
      const fgColor = rg.fg_color;
      const fill = fgColor ? `rgb(${fgColor[0]}, ${fgColor[1]}, ${fgColor[2]})` : undefined;
      
      // Compose fontStyle from bold/italic flags
      const fontStyleParts: string[] = [];
      if (rg.bold) fontStyleParts.push("bold");
      if (rg.italic) fontStyleParts.push("italic");
      const fontStyle = fontStyleParts.length > 0 ? fontStyleParts.join(" ") : undefined;
      
      // Compose textDecoration from underline/strikethrough flags
      const textDecorationParts: string[] = [];
      if (rg.underline) textDecorationParts.push("underline");
      if (rg.strikethrough) textDecorationParts.push("line-through");
      const textDecoration = textDecorationParts.length > 0 ? textDecorationParts.join(" ") : undefined;

      const direction = normalizeDirection(rg.direction, rg.box);

      let align = (rg.alignment ?? "").trim().toLowerCase();
      if (align === "auto" || align === "") {
        align = "left";
      } else if (align !== "left" && align !== "center" && align !== "right") {
        align = "left";
      }

      const region: EditorRegion = {
        id: `${page.id}:${regionIndex}`,
        regionIndex,
        box: rg.box,
        text: rg.text_translated || "",
        textOriginal: rg.text_original || "",
        fontSize: rg.font_size,
        fill,
        fontFamily: rg.font_family,
        fontStyle,
        textDecoration,
        align,
        lineHeight: rg.line_spacing,
        letterSpacing: rg.letter_spacing,
        direction,
        strokeColor: rg.stroke_color,
        strokeWidth: rg.stroke_width,
      };

      return region;
    });
    setEditorRegions(nextEditorRegions);
    const baseline: Record<string, string> = {};
    for (const r of nextEditorRegions) baseline[r.id] = r.text;
    editorBackendBaselineRef.current = baseline;
    setEditorDirtyRegionIds(new Set());

    if (page.imageSize && page.imageSize.length === 2) {
      setEditorImgNatural(page.imageSize);
    } else if (nextBase) {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load base image"));
        img.src = nextBase as string;
      });
      setEditorImgNatural([img.naturalWidth, img.naturalHeight]);
    } else {
      setEditorImgNatural(null);
    }
  }, [revokeEditorUrls]);

  useEffect(() => {
    if (!editorMode) return;

    setEditorProjectError("");
    setStatus("idle");
    setError("");
    setFiles([]);
    setQueue([]);
    setCompleted(0);
    setCurrentIndex(0);

    let pages: MangaPage[];

    if (workspaceMode) {
      const ws = loadEditorWorkspace();
      if (!ws || ws.pages.length === 0) {
        setEditorProjectError("未找到编辑工作区数据");
        return;
      }
      pages = ws.pages.slice();
    } else {
      const books = loadLibrary();
      const book = books.find((b) => b.id === bookIdFromQuery);
      const chapter = book?.chapters.find((c) => c.id === chapterIdFromQuery);
      if (!book || !chapter) {
        setEditorProjectError("未找到编辑项目（book/chapter 不存在）");
        return;
      }
      pages = chapter.pages.slice();
    }

    setEditorPages(pages);
    setEditorPageIndex(0);

    void loadEditorPage(pages, 0).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setEditorProjectError(message);
    });

    return () => {
      revokeEditorUrls();
    };
  }, [editorMode, workspaceMode, bookIdFromQuery, chapterIdFromQuery, loadEditorPage, revokeEditorUrls]);

  const persistPageUpdate = useCallback((pageId: string, updater: (p: MangaPage) => MangaPage) => {
    if (workspaceMode) {
      updatePageInWorkspace(pageId, updater);
    } else {
      updatePageInChapter({ bookId: bookIdFromQuery, chapterId: chapterIdFromQuery, pageId }, updater);
    }
  }, [workspaceMode, bookIdFromQuery, chapterIdFromQuery]);

  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [completed, setCompleted] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);


  const applyImportedImages = (imgsRaw: File[], nameOverride?: string) => {
    const imgs = imgsRaw.filter(isSupportedImageFile).sort((a, b) => naturalCompare(a.name, b.name));

    if (originalUrl?.startsWith("blob:")) URL.revokeObjectURL(originalUrl);
    if (translatedUrl?.startsWith("blob:")) URL.revokeObjectURL(translatedUrl);

    setFiles(imgs);
    const taskName = nameOverride
      ? sanitizeFolderName(nameOverride)
      : imgs.length > 1
        ? makeTimestampName()
        : imgs[0]
          ? sanitizeFolderName(getBasename(imgs[0].name))
          : "";
    setImportName(taskName);
    setQueue(imgs.map((f) => ({ id: crypto.randomUUID(), file: f, status: "pending" })));
    setCompleted(0);
    setCurrentIndex(0);
    setRegionsCount(0);
    setDetectedLang("");
    setUsedOcr("");
    setStatus("idle");
    setError("");
    setTranslatedUrl(null);
    setOriginalUrl(imgs[0] ? URL.createObjectURL(imgs[0]) : null);

    setEditorBaseUrl(null);
    setEditorUseBackendPreview(false);
    setEditorDirtyRegionIds(new Set());
    editorBackendBaselineRef.current = {};
    setEditorRegions([]);
    setEditingId(null);
    setEditingValue("");
    setEditorImgNatural(null);
  };

  useEffect(() => {
    return () => {
      if (originalUrl?.startsWith("blob:")) URL.revokeObjectURL(originalUrl);
      if (translatedUrl?.startsWith("blob:")) URL.revokeObjectURL(translatedUrl);
    };
  }, [originalUrl, translatedUrl]);

  const canRun = files.length > 0 && status !== "running";

  const outputFileName = useMemo(() => {
    const name = files[0]?.name || "translated.jpg";
    const dot = name.lastIndexOf(".");
    const base = dot >= 0 ? name.slice(0, dot) : name;
    return `${base}.translated.jpg`;
  }, [files]);

  const editedOutputFileName = useMemo(() => {
    const name = files[currentIndex]?.name || files[0]?.name || "edited.jpg";
    const dot = name.lastIndexOf(".");
    const base = dot >= 0 ? name.slice(0, dot) : name;
    return `${base}.edited.jpg`;
  }, [files, currentIndex]);

  const renderEditorCanvas = async (baseUrl: string, regions: EditorRegion[], size: [number, number], seq: number, drawText: boolean) => {
    const canvas = editorCanvasRef.current;
    if (!canvas) return;
    const [w, h] = size;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load base image"));
      img.src = baseUrl;
    });

    if (editorRenderSeqRef.current !== seq) return;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    if (!drawText) return;

    const wrapLines = (text: string, maxWidth: number, font: string) => {
      ctx.font = font;
      const paragraphs = String(text ?? "").split(/\r?\n/);
      const lines: string[] = [];
      for (const para of paragraphs) {
        const chars = Array.from(para);
        let line = "";
        for (const ch of chars) {
          const test = line + ch;
          const m = ctx.measureText(test).width;
          if (m > maxWidth && line) {
            lines.push(line);
            line = ch;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        if (para === "" && paragraphs.length > 1) lines.push("");
      }
      return lines;
    };

    for (const r of regions) {
      if (editorRenderSeqRef.current !== seq) return;
      const [x, y, bw, bh] = r.box;
      const pad = Math.max(2, Math.floor(Math.min(bw, bh) * 0.06));
      const maxWidth = Math.max(1, bw - pad * 2);
      const maxHeight = Math.max(1, bh - pad * 2);

      const baseFontSize = Math.max(12, Math.floor(bh * 0.28));
      let fontSize = baseFontSize;
      let lines: string[] = [];

      for (let tries = 0; tries < 12; tries += 1) {
        const font = `${fontSize}px sans-serif`;
        lines = wrapLines(r.text || "", maxWidth, font);
        const lineHeight = Math.floor(fontSize * 1.15);
        const totalHeight = lines.length * lineHeight;
        if (totalHeight <= maxHeight) break;
        fontSize = Math.max(10, Math.floor(fontSize * 0.9));
      }

      const font = `${fontSize}px sans-serif`;
      ctx.font = font;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";

      const lineHeight = Math.floor(fontSize * 1.15);
      const totalHeight = lines.length * lineHeight;
      const startY = y + pad + Math.max(0, Math.floor((maxHeight - totalHeight) / 2));

      ctx.lineWidth = Math.max(2, Math.floor(fontSize * 0.18));
      ctx.strokeStyle = "black";
      ctx.fillStyle = "white";

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const lineW = ctx.measureText(line).width;
        const startX = x + pad + Math.max(0, (maxWidth - lineW) / 2);
        const yy = startY + i * lineHeight;
        ctx.strokeText(line, startX, yy);
        ctx.fillText(line, startX, yy);
      }
    }
  };

  useEffect(() => {
    if (!editorBaseUrl || !editorImgNatural) return;
    const seq = (editorRenderSeqRef.current += 1);
    const regionsToDraw = editorUseBackendPreview ? editorRegions.filter((r) => editorDirtyRegionIds.has(r.id)) : editorRegions;
    const drawText = !editorUseBackendPreview || regionsToDraw.length > 0;
    void renderEditorCanvas(editorBaseUrl, regionsToDraw, editorImgNatural, seq, drawText).catch(() => {
      // ignore
    });
  }, [editorBaseUrl, editorRegions, editorImgNatural, editorUseBackendPreview, editorDirtyRegionIds]);

  const applyBackendRender = useCallback(async () => {
    if (!editorMode) return;
    const page = editorPages[editorPageIndex];
    if (!page) return;

    if (!page.translatedBlobKey && !page.translatedUrl) {
      setEditorProjectError("缺少底图（clean/trans）");
      return;
    }

    let baseBlob: Blob | null = null;
    if (page.translatedBlobKey) {
      try {
        baseBlob = await getBlob(page.translatedBlobKey);
      } catch {
        baseBlob = null;
      }
    }
    if (!baseBlob && page.translatedUrl) {
      baseBlob = await resolveImageToBlob(page.translatedUrl);
    }
    if (!baseBlob) {
      setEditorProjectError("读取底图失败");
      return;
    }

    // Build regions from editorRegions directly to ensure all modifications are captured
    console.log("=== applyBackendRender: editorRegions ===");
    editorRegions.forEach((r, i) => {
      console.log(`  [${i}] id=${r.id}, box=[${r.box.join(", ")}]`);
    });
    
    const regions: TextRegion[] = editorRegions.map((edited) => {
      const original = (page.regions ?? [])[edited.regionIndex];
      const base: TextRegion =
        original ??
        ({
          box: edited.box,
          text_original: "",
          text_translated: "",
        } satisfies TextRegion);

      const updated: TextRegion = {
        ...base,
        box: edited.box,
        text_translated: edited.text,
        text_original: edited.textOriginal || base.text_original || "",
      };
      
      // CRITICAL: Sync polygon with box to ensure backend uses correct coordinates
      // Backend prioritizes polygon over box, so we must update polygon when box changes
      const [x, y, w, h] = edited.box;
      updated.polygon = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ];
      
      console.log(`Region ${edited.regionIndex}: box=[${x}, ${y}, ${w}, ${h}], polygon=`, updated.polygon);
      
      // Always sync font properties (use defaults if undefined)
      updated.font_size = edited.fontSize ?? base.font_size ?? 16;
      updated.font_family = edited.fontFamily ?? base.font_family ?? "sans-serif";
      updated.alignment = edited.align ?? base.alignment ?? "left";
      updated.line_spacing = edited.lineHeight ?? base.line_spacing ?? 1.0;
      // letter_spacing: frontend uses absolute pixel values, backend expects the same
      updated.letter_spacing = edited.letterSpacing ?? base.letter_spacing ?? 0;
      // direction: sync from edited region (user can change this)
      updated.direction = edited.direction ?? base.direction ?? "horizontal";
      
      // Sync color - ensure we always have fg_color
      if (edited.fill) {
        const match = edited.fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          updated.fg_color = [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
        } else if (edited.fill.startsWith("#")) {
          const hex = edited.fill.slice(1);
          if (hex.length === 6) {
            updated.fg_color = [
              parseInt(hex.slice(0, 2), 16),
              parseInt(hex.slice(2, 4), 16),
              parseInt(hex.slice(4, 6), 16),
            ];
          }
        } else {
          // Fallback: assume it's already a color name or invalid, use white
          updated.fg_color = base.fg_color ?? [255, 255, 255];
        }
      } else {
        updated.fg_color = base.fg_color ?? [255, 255, 255];
      }
      
      // Ensure bg_color exists (for text stroke)
      if (!updated.bg_color) updated.bg_color = base.bg_color ?? [0, 0, 0];
      
      // Sync font style flags from edited region
      updated.bold = edited.fontStyle?.includes("bold") ?? base.bold ?? false;
      updated.italic = edited.fontStyle?.includes("italic") ?? base.italic ?? false;
      updated.underline = edited.textDecoration?.includes("underline") ?? base.underline ?? false;
      updated.strikethrough = edited.textDecoration?.includes("line-through") ?? base.strikethrough ?? false;

      // Sync stroke settings
      if (edited.strokeColor !== undefined) updated.stroke_color = edited.strokeColor;
      if (edited.strokeWidth !== undefined) updated.stroke_width = edited.strokeWidth;
      
      return updated;
    });

    // Debug: log the regions being sent to backend
    console.log("[applyBackendRender] Sending regions to backend:", JSON.stringify(regions, null, 2));

    const fileName = page.fileName || "page.jpg";
    const file = new File([baseBlob], fileName, { type: baseBlob.type || "image/jpeg" });

    try {
      setEditorProjectError("");
      const res = await renderMangaPage({
        file,
        regions,
      });

      if (typeof res.renderedCount === "number" && res.renderedCount <= 0) {
        setEditorProjectError("后端渲染返回成功，但渲染了 0 个文本框：请确认 regions 的 polygon/box 有效且 text_translated 非空（已在后端增加 polygon 兜底，重启后端后再试）");
        return;
      }

      const outBlob = await resolveImageToBlob(res.image);
      const renderDir = workspaceMode ? `${QUICK_BOOK_ID}/_workspace` : `${bookIdFromQuery}/${chapterIdFromQuery}`;
      const renderedKey = await putBlob(outBlob, { dir: renderDir });
      const renderedUrl = URL.createObjectURL(outBlob);

      persistPageUpdate(page.id, (p) => ({ ...p, renderedBlobKey: renderedKey, renderedUrl: undefined }));

      setEditorPages((prev) =>
        prev.map((pp) => (pp.id === page.id ? { ...pp, renderedBlobKey: renderedKey, renderedUrl: undefined } : pp)),
      );

      const prevRendered = editorUrlRef.current.rendered;
      if (prevRendered?.startsWith("blob:")) URL.revokeObjectURL(prevRendered);
      editorUrlRef.current.rendered = renderedUrl;

      const baseline: Record<string, string> = {};
      for (const r of editorRegions) baseline[r.id] = r.text;
      editorBackendBaselineRef.current = baseline;
      setEditorDirtyRegionIds(new Set());
      setEditorUseBackendPreview(true);
      setEditorBaseUrl(renderedUrl);
      if (res.imageSize && res.imageSize.length === 2) {
        setEditorImgNatural(res.imageSize);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setEditorProjectError(message);
    }
  }, [bookIdFromQuery, chapterIdFromQuery, editorDirtyRegionIds.size, editorMode, editorPageIndex, editorPages, editorRegions, editorUseBackendPreview]);

  const saveToBookshelf = useCallback(async () => {
    if (!editorMode) return;
    if (editorPages.length === 0) {
      setEditorProjectError("没有可保存的页面");
      return;
    }

    setEditorSaving(true);
    setEditorSaveProgress("准备保存...");
    setEditorProjectError("");

    try {
      let targetBookId: string;
      let chapterTitle: string;

      if (workspaceMode) {
        const ws = loadEditorWorkspace();
        targetBookId = QUICK_BOOK_ID;
        chapterTitle = ws?.title || `编辑结果_${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/[/:\s]/g, "")}`;
      } else {
        const isFromQuickBook = bookIdFromQuery === QUICK_BOOK_ID;
        targetBookId = isFromQuickBook ? QUICK_BOOK_ID : bookIdFromQuery;
        const lib = loadLibrary();
        const sourceBook = lib.find((b) => b.id === bookIdFromQuery);
        const sourceChapter = sourceBook?.chapters.find((c) => c.id === chapterIdFromQuery);
        chapterTitle = sourceChapter?.title || `编辑结果_${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/[/:\s]/g, "")}`;
      }

      const newChapter = createChapter(targetBookId, chapterTitle, { kind: "cooked" });

      const total = editorPages.length;
      for (let i = 0; i < editorPages.length; i++) {
        const page = editorPages[i];
        setEditorSaveProgress(`渲染并保存 ${i + 1}/${total}...`);

        let renderedBlobKey = page.renderedBlobKey;

        if (!renderedBlobKey) {
          if (!page.translatedBlobKey && !page.translatedUrl) {
            setEditorSaveProgress(`跳过第 ${i + 1} 页（无底图）`);
            continue;
          }

          let baseBlob: Blob | null = null;
          if (page.translatedBlobKey) {
            try {
              baseBlob = await getBlob(page.translatedBlobKey);
            } catch {
              baseBlob = null;
            }
          }
          if (!baseBlob && page.translatedUrl) {
            baseBlob = await resolveImageToBlob(page.translatedUrl);
          }
          if (!baseBlob) {
            setEditorSaveProgress(`跳过第 ${i + 1} 页（底图读取失败）`);
            continue;
          }

          const pageRegions = (page.regions ?? []).map((rg, idx) => {
            const [x, y, w, h] = rg.box;
            return {
              ...rg,
              polygon: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as [[number, number], [number, number], [number, number], [number, number]],
            };
          });

          const fileName = page.fileName || `page_${i + 1}.jpg`;
          const file = new File([baseBlob], fileName, { type: baseBlob.type || "image/jpeg" });

          try {
            const res = await renderMangaPage({ file, regions: pageRegions });
            const outBlob = await resolveImageToBlob(res.image);
            renderedBlobKey = await putBlob(outBlob, { dir: `${targetBookId}/${newChapter.id}` });
          } catch (err) {
            console.error(`Failed to render page ${i + 1}:`, err);
            setEditorSaveProgress(`第 ${i + 1} 页渲染失败，跳过`);
            continue;
          }
        }

        let newOriginalBlobKey = "";
        let newTranslatedBlobKey = "";

        if (workspaceMode) {
          newOriginalBlobKey = page.originalBlobKey || "";
          newTranslatedBlobKey = renderedBlobKey || "";
        } else {
          if (page.originalBlobKey) {
            try {
              const blob = await getBlob(page.originalBlobKey);
              if (blob) {
                newOriginalBlobKey = await putBlob(blob, { dir: `${targetBookId}/${newChapter.id}`, name: page.fileName });
              }
            } catch {
              newOriginalBlobKey = page.originalBlobKey;
            }
          }

          if (renderedBlobKey) {
            try {
              const blob = await getBlob(renderedBlobKey);
              if (blob) {
                newTranslatedBlobKey = await putBlob(blob, { dir: `${targetBookId}/${newChapter.id}` });
              }
            } catch {
              newTranslatedBlobKey = renderedBlobKey;
            }
          }
        }

        addPageToChapter(targetBookId, newChapter.id, {
          id: crypto.randomUUID(),
          fileName: page.fileName || `page_${i + 1}.jpg`,
          createdAt: Date.now(),
          imageSize: page.imageSize,
          originalBlobKey: newOriginalBlobKey,
          translatedBlobKey: newTranslatedBlobKey,
        });
      }

      if (workspaceMode) {
        clearEditorWorkspace();
      } else if (bookIdFromQuery === QUICK_BOOK_ID) {
        const removed = removeChapters(QUICK_BOOK_ID, [chapterIdFromQuery]);
        const keysToDel: string[] = [];
        for (const ch of removed) {
          keysToDel.push(...getAllBlobKeysFromChapter(ch));
        }
        for (const k of Array.from(new Set(keysToDel))) {
          try {
            await deleteBlob(k);
          } catch {
            // ignore
          }
        }
      }

      setEditorSaveProgress("保存完成！");
      setTimeout(() => {
        setEditorSaving(false);
        setEditorSaveProgress("");
        const targetPath = `/shelf/${encodeURIComponent(targetBookId)}/${encodeURIComponent(newChapter.id)}`;
        void showConfirm({ title: "保存成功", message: `已创建章节"${chapterTitle}"。\n是否前往查看？`, confirmLabel: "前往查看" }).then((ok) => {
          if (ok) router.push(targetPath);
        });
      }, 500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "保存失败");
      setEditorProjectError(message);
      setEditorSaving(false);
      setEditorSaveProgress("");
    }
  }, [bookIdFromQuery, chapterIdFromQuery, editorMode, editorPages, router]);


  const handleOcrRegion = useCallback(async (rect: DrawingRect) => {
    if (!editorMode) return;
    const page = editorPages[editorPageIndex];
    if (!page?.originalBlobKey) {
      setEditorProjectError("缺少原始图片");
      return;
    }

    try {
      const blob = await getBlob(page.originalBlobKey);
      if (!blob) throw new Error("无法读取原始图片");

      const formData = new FormData();
      formData.append("file", blob, "image.jpg");
      formData.append("x", String(Math.round(rect.x)));
      formData.append("y", String(Math.round(rect.y)));
      formData.append("width", String(Math.round(rect.width)));
      formData.append("height", String(Math.round(rect.height)));
      formData.append("ocr", ocrMode);
      formData.append("target_lang", targetLanguage);
      formData.append("translator", translator);
      formData.append("translate", "true");

      const res = await fetch(`${getBackendUrl()}/ocr_region`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.status === "success") {
        // 使用当前页面regions数量生成唯一索引，避免删除后ID冲突
        const currentPageRegions = editorPages[editorPageIndex]?.regions ?? [];
        const newRegionIndex = currentPageRegions.length;
        const newId = `${page.id}:${newRegionIndex}`;
        const textContent = data.text_translated || data.text_original || "";
        const originalText = data.text_original || "";
        const regionBox: [number, number, number, number] = [
          Math.round(rect.x),
          Math.round(rect.y),
          Math.round(rect.width),
          Math.round(rect.height),
        ];
        const resolvedDirection = normalizeDirection(data.direction, regionBox);
        
        // 估算字体大小：根据框的尺寸计算合适的字体大小
        const estimateFontSize = (boxWidth: number, boxHeight: number, text: string): number => {
          if (!text || text.length === 0) return 24;
          
          const charCount = text.length;
          const lineBreaks = (text.match(/\n/g) || []).length;
          
          // 判断文本方向：如果高度明显大于宽度，可能是竖排文本
          const isVertical = boxHeight > boxWidth * 1.5;
          
          if (isVertical) {
            // 竖排文本：字体大小约为框宽度的 70-80%
            const sizeFromWidth = Math.round(boxWidth * 0.75);
            // 也根据高度和字符数估算
            const estimatedCols = Math.max(1, lineBreaks + 1);
            const charsPerCol = Math.ceil(charCount / estimatedCols);
            const sizeFromHeight = charsPerCol > 0 ? Math.round(boxHeight / charsPerCol * 0.9) : sizeFromWidth;
            // 取较小值以确保文字能放入框内
            const estimated = Math.min(sizeFromWidth, sizeFromHeight);
            return Math.max(14, Math.min(72, estimated));
          } else {
            // 横排文本：估算行数和每行字符数
            const estimatedLines = Math.max(1, lineBreaks + 1);
            const charsPerLine = Math.ceil(charCount / estimatedLines);
            
            // 根据框高度和行数估算
            const lineHeight = boxHeight / estimatedLines;
            const sizeFromHeight = Math.round(lineHeight * 0.85);
            
            // 根据框宽度和每行字符数估算（中文字符宽度约等于字体大小）
            const sizeFromWidth = charsPerLine > 0 ? Math.round(boxWidth / charsPerLine) : sizeFromHeight;
            
            // 取较大值（因为用户框选的区域通常比实际文本大）
            // 但限制最大不超过框高度的一半
            const maxFromBox = Math.round(boxHeight * 0.5);
            const estimated = Math.min(Math.max(sizeFromHeight, sizeFromWidth), maxFromBox);
            return Math.max(14, Math.min(72, estimated));
          }
        };
        
        // 优先使用后端返回的font_size，否则使用前端估算
        const backendFontSize = data.font_size ? Number(data.font_size) : null;
        const finalFontSize = backendFontSize && backendFontSize > 0 
          ? backendFontSize 
          : estimateFontSize(rect.width, rect.height, originalText);
        
        const newRegion: EditorRegion = {
          id: newId,
          regionIndex: newRegionIndex,
          box: regionBox,
          text: textContent,
          textOriginal: originalText,
          fontSize: finalFontSize,
          fill: "#000000",
          fontFamily: "sans-serif",
          align: "left",
          direction: resolvedDirection || DIRECTION_HORIZONTAL,
        };
        setEditorRegions([...editorRegions, newRegion]);
        
        // 同步到 editorPages 中对应页面的 regions 数组
        const storageRegion = {
          box: newRegion.box,
          text_original: originalText,
          text_translated: textContent,
          font_size: finalFontSize,
          fg_color: [0, 0, 0] as [number, number, number],
          alignment: "left",
          direction: newRegion.direction || DIRECTION_HORIZONTAL,
        };
        setEditorPages((prev) =>
          prev.map((pp, idx) => {
            if (idx !== editorPageIndex) return pp;
            const nextRegs = [...(pp.regions ?? []), storageRegion];
            return { ...pp, regions: nextRegs };
          }),
        );
        
        setEditingId(newId);
        setEditingValue(newRegion.text);
        void showAlert({ title: "识别结果", message: `原文: ${data.text_original}\n译文: ${data.text_translated}` });
      } else {
        setEditorProjectError(data.message || "OCR 失败");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "OCR 失败");
      setEditorProjectError(message);
    }
  }, [editorMode, editorPages, editorPageIndex, editorRegions, ocrMode, targetLanguage, translator]);

  const handleInpaintRegion = useCallback(async (rect: DrawingRect) => {
    if (!editorMode) return;
    const page = editorPages[editorPageIndex];
    
    const baseKey = page?.translatedBlobKey || page?.originalBlobKey;
    if (!baseKey) {
      setEditorProjectError("缺少图片");
      return;
    }

    try {
      const blob = await getBlob(baseKey);
      if (!blob) throw new Error("无法读取图片");

      const formData = new FormData();
      formData.append("file", blob, "image.jpg");
      formData.append("mask_rect", JSON.stringify({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      }));
      formData.append("inpainter", inpainter || "lama_large");
      formData.append("inpainting_size", String(inpaintingSize || 2048));

      const res = await fetch(`${getBackendUrl()}/inpaint_region`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.status === "success" && data.inpainted_image) {
        const imgRes = await fetch(data.inpainted_image);
        const newBlob = await imgRes.blob();
        const inpaintDir = workspaceMode ? `${QUICK_BOOK_ID}/_workspace` : `${bookIdFromQuery}/${chapterIdFromQuery}`;
        const newKey = await putBlob(newBlob, { dir: inpaintDir });

        const newUrl = URL.createObjectURL(newBlob);
        if (editorUrlRef.current.base?.startsWith("blob:")) {
          URL.revokeObjectURL(editorUrlRef.current.base);
        }
        editorUrlRef.current.base = newUrl;
        setEditorBaseUrl(newUrl);
        setTranslatedUrl(newUrl);

        const updatedPage = { ...page, translatedBlobKey: newKey };
        const newPages = [...editorPages];
        newPages[editorPageIndex] = updatedPage;
        setEditorPages(newPages);

        void showAlert({ title: "提示", message: "修补完成！" });
      } else {
        setEditorProjectError(data.message || "Inpaint 失败");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Inpaint 失败");
      setEditorProjectError(message);
    }
  }, [editorMode, editorPages, editorPageIndex, inpainter, inpaintingSize]);

  const pickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";

    void (async () => {
      try {
        const resolved = await resolveFilesToImages(list, { signal: abortRef.current?.signal });
        if (resolved) {
          applyImportedImages(resolved.images, resolved.nameHint);
        } else {
          applyImportedImages(list);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setError(message);
        setStatus("error");
      }
    })();
  };

  const dropImport = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (status === "running") return;

    type FSEntry = {
      isFile: boolean;
      isDirectory: boolean;
      name: string;
      file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
      createReader?: () => { readEntries: (cb: (ents: unknown[]) => void, err?: (e: unknown) => void) => void };
    };

    const items = Array.from(e.dataTransfer.items ?? []);
    const entries = items
      .map((it) => (it as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.())
      .filter(Boolean) as FSEntry[];

    const fileFromEntry = (entry: FSEntry) =>
      new Promise<File>((resolve, reject) => {
        if (!entry.file) { reject(new Error("Invalid file entry")); return; }
        entry.file(resolve, reject);
      });

    const readAllEntries = async (reader: { readEntries: (cb: (ents: unknown[]) => void, err?: (e: unknown) => void) => void }) => {
      const all: unknown[] = [];
      while (true) {
        const batch = await new Promise<unknown[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        all.push(...batch);
      }
      return all;
    };

    const collectFiles = async (entry: FSEntry): Promise<File[]> => {
      if (entry.isFile) {
        try { return [await fileFromEntry(entry)]; } catch { return []; }
      }
      if (entry.isDirectory && entry.createReader) {
        const childEntries = (await readAllEntries(entry.createReader())) as FSEntry[];
        return (await Promise.all(childEntries.map(collectFiles))).flat();
      }
      return [];
    };

    const firstDir = entries.find((en) => en.isDirectory);

    const collectAndResolve = async (fileList: File[], dirName?: string) => {
      try {
        const resolved = await resolveFilesToImages(fileList, { signal: abortRef.current?.signal });
        if (resolved) {
          applyImportedImages(resolved.images, resolved.nameHint);
        } else {
          applyImportedImages(fileList, dirName);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setError(message);
        setStatus("error");
      }
    };

    if (entries.length > 0) {
      const flattened = (await Promise.all(entries.map(collectFiles))).flat();
      await collectAndResolve(flattened, firstDir?.name);
      return;
    }

    const list = Array.from(e.dataTransfer.files ?? []);
    await collectAndResolve(list);
  };

  const pickOutputDir = async () => {
    if (typeof window === "undefined") return;
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      setError("当前环境不支持选择输出文件夹（需要 Chromium File System Access API / Electron）。");
      setStatus("error");
      return;
    }

    try {
      const handle = await picker();
      await ensureOutputDirPermission(handle);
      setOutputDir(handle);
      setOutputDirName((handle as unknown as { name?: string }).name ?? "");
    } catch {
      // ignore
    }
  };

  const runBatch = async () => {
    if (files.length === 0) return;
    if (!outputDir) {
      setError("请先选择输出文件夹。");
      setStatus("error");
      return;
    }
    if (!importName) {
      setError("请先导入图片或文件夹。");
      setStatus("error");
      return;
    }

    try {
      // IMPORTANT: request permission + create target folder immediately after user click,
      // before any long awaits (otherwise browsers may require a new user activation).
      await ensureOutputDirPermission(outputDir);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setError(message);
      setStatus("error");
      return;
    }

    abortRef.current?.abort();
    const aborter = new AbortController();
    abortRef.current = aborter;

    if (translatedUrl?.startsWith("blob:")) URL.revokeObjectURL(translatedUrl);
    setTranslatedUrl(null);
    setRegionsCount(0);
    setDetectedLang("");
    setUsedOcr("");
    setCompleted(0);
    setCurrentIndex(0);
    setStatus("running");
    setError("");

    let targetDir: DirectoryHandle;
    try {
      targetDir = await outputDir.getDirectoryHandle(importName, { create: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err ?? "Failed");
      setError(message);
      setStatus("error");
      return;
    }

    // 1) Probe first N images
    const N = Math.min(files.length, 6);
    const counts: Record<string, number> = {};
    let probed = 0;
    for (let i = 0; i < N; i += 1) {
      if (aborter.signal.aborted) return;
      try {
        const p = await probeLang({
          file: files[i],
          detector: textDetector,
          detectionSize: detectionResolution,
          signal: aborter.signal,
        });
        const k = p.detectedLang || "unknown";
        counts[k] = (counts[k] ?? 0) + 1;
        probed += 1;
      } catch {
        // ignore probe errors
        counts.unknown = (counts.unknown ?? 0) + 1;
        probed += 1;
      }
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const dominantLang = sorted[0]?.[0] ?? "unknown";
    const dominantRatio = probed > 0 ? (sorted[0]?.[1] ?? 0) / probed : 0;
    const mixed = dominantRatio < 0.7 || dominantLang === "unknown";
    const effectiveBatchLang = mixed ? "auto" : dominantLang;

    // 2) Run sequentially and write to folder
    for (let i = 0; i < files.length; i += 1) {
      if (aborter.signal.aborted) return;

      const f = files[i];
      setCurrentIndex(i);
      setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: "running", error: undefined } : it)));

      if (originalUrl?.startsWith("blob:")) URL.revokeObjectURL(originalUrl);
      setOriginalUrl(URL.createObjectURL(f));

      try {
        const res = await scanMangaImage({
          file: f,
          lang: lang === "auto" ? effectiveBatchLang : lang,
          inpainter,
          detector: textDetector,
          detectionSize: detectionResolution,
          inpaintingSize,
          targetLang: targetLanguage,
          ocr: ocrMode,
          signal: aborter.signal,
        });
        setRegionsCount(res.regions.length);
        setDetectedLang(res.detectedLang ?? "");
        setUsedOcr(res.usedOcr ?? "");

        const base = res.cleanImage || res.translatedImage;
        setEditorBaseUrl(base || null);
        setEditingId(null);
        setEditingValue("");
        setEditorRegions(
          (res.regions ?? []).map((rg, idx) => ({
            id: `${i}:${idx}`,
            regionIndex: idx,
            box: rg.box as [number, number, number, number],
            text: rg.text_translated || rg.text_original || "",
            fontSize: rg.font_size,
            fill: rg.fg_color ? `rgb(${rg.fg_color[0]}, ${rg.fg_color[1]}, ${rg.fg_color[2]})` : undefined,
          })),
        );
        if (res.imageSize && res.imageSize.length === 2) {
          setEditorImgNatural(res.imageSize);
        } else {
          setEditorImgNatural(null);
        }

        const blob = await resolveImageToBlob(res.translatedImage);
        const fileHandle = await targetDir.getFileHandle(f.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        if (translatedUrl?.startsWith("blob:")) URL.revokeObjectURL(translatedUrl);
        setTranslatedUrl(URL.createObjectURL(blob));

        setQueue((q) =>
          q.map((it, idx) =>
            idx === i
              ? { ...it, status: "success", detectedLang: res.detectedLang, usedOcr: res.usedOcr }
              : it,
          ),
        );
        setCompleted((v) => v + 1);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: "error", error: message } : it)));
      }
    }

    setStatus("done");
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const right = editorMode ? (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-slate-500">
        {editorPages.length > 0 ? `${editorPageIndex + 1} / ${editorPages.length}` : "-"}
      </span>
      <button
        onClick={() => void applyBackendRender()}
        disabled={editorPages.length === 0}
        className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
      >
        渲染(后端)
      </button>
      <button
        onClick={() => {
           void showAlert({ title: "提示", message: "导出功能正在迁移至 Konva" });
        }}
        className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors"
      >
        导出
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <button
        onClick={runBatch}
        disabled={!canRun}
        className={`px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-colors ${
          !canRun ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"
        }`}
      >
        {status === "running" ? "翻译中..." : "开始翻译"}
      </button>
      {status === "running" && (
        <button onClick={cancel} className="px-3 py-1.5 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors">
          停止
        </button>
      )}
    </div>
  );

  const updateRegion = useCallback(
    (id: string, newBox: [number, number, number, number], newText: string) => {
      // Optimistic update
      setEditorRegions((prev) => prev.map((r) => (r.id === id ? { ...r, box: newBox, text: newText } : r)));

      if (!editorMode) return;
      const page = editorPages[editorPageIndex];
      if (!page) return;

      const parts = id.split(":");
      const regionIdx = parseInt(parts[parts.length - 1], 10);
      if (isNaN(regionIdx)) return;

      try {
        persistPageUpdate(page.id, (p) => {
            const regs = (p.regions ?? []).slice();
            if (regs[regionIdx]) {
              regs[regionIdx] = { ...regs[regionIdx], box: newBox, text_translated: newText };
            }
            return { ...p, regions: regs };
          });

        setEditorPages((prev) =>
          prev.map((pp) => {
            if (pp.id !== page.id) return pp;
            const nextRegs = (pp.regions ?? []).slice();
            if (nextRegs[regionIdx]) {
              nextRegs[regionIdx] = { ...nextRegs[regionIdx], box: newBox, text_translated: newText };
            }
            return { ...pp, regions: nextRegs };
          }),
        );

        if (page.renderedBlobKey || page.renderedUrl) {
          // const baseline = editorBackendBaselineRef.current[id] ?? ""; 
          // Note: baseline check might be complex if text changed. 
          // For now just mark dirty if touched.
          setEditorDirtyRegionIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }
      } catch (e) {
        console.error("Failed to save region", e);
      }
    },
    [editorMode, editorPages, editorPageIndex],
  );

  const deleteRegion = useCallback(
    (id: string) => {
      // Clear selection if deleted region was selected
      if (editingId === id) {
        setEditingId(null);
        setEditingValue("");
      }

      if (!editorMode) return;
      const page = editorPages[editorPageIndex];
      if (!page) return;

      const parts = id.split(":");
      const regionIdx = parseInt(parts[parts.length - 1], 10);
      if (isNaN(regionIdx)) return;

      try {
        persistPageUpdate(page.id, (p) => {
            const regs = (p.regions ?? []).slice();
            regs.splice(regionIdx, 1);
            return { ...p, regions: regs };
          });

        // 更新 editorPages 并重新同步 editorRegions
        setEditorPages((prev) => {
          const updated = prev.map((pp) => {
            if (pp.id !== page.id) return pp;
            const nextRegs = (pp.regions ?? []).slice();
            nextRegs.splice(regionIdx, 1);
            return { ...pp, regions: nextRegs };
          });
          
          // 从更新后的 editorPages 重建 editorRegions，确保ID同步
          const updatedPage = updated[editorPageIndex];
          if (updatedPage) {
            const newEditorRegions = (updatedPage.regions ?? []).map((rg, idx) => {
              const fgColor = rg.fg_color;
              const fill = fgColor ? `rgb(${fgColor[0]}, ${fgColor[1]}, ${fgColor[2]})` : undefined;
              const fontStyleParts: string[] = [];
              if (rg.bold) fontStyleParts.push("bold");
              if (rg.italic) fontStyleParts.push("italic");
              const fontStyle = fontStyleParts.length > 0 ? fontStyleParts.join(" ") : undefined;
              const textDecorationParts: string[] = [];
              if (rg.underline) textDecorationParts.push("underline");
              if (rg.strikethrough) textDecorationParts.push("line-through");
              const textDecoration = textDecorationParts.length > 0 ? textDecorationParts.join(" ") : undefined;
              let direction = (rg.direction ?? "").trim().toLowerCase();
              if (!direction || direction === "auto") {
                const [, , w, h] = rg.box;
                direction = h > w * 1.35 ? "vertical" : "horizontal";
              } else if (direction === "v" || direction === "vr") {
                direction = "vertical";
              } else if (direction === "h") {
                direction = "horizontal";
              }
              let align = (rg.alignment ?? "").trim().toLowerCase();
              if (align === "auto" || align === "") align = "left";
              else if (align !== "left" && align !== "center" && align !== "right") align = "left";
              
              return {
                id: `${updatedPage.id}:${idx}`,
                regionIndex: idx,
                box: rg.box,
                text: rg.text_translated || "",
                textOriginal: rg.text_original || "",
                fontSize: rg.font_size,
                fill,
                fontFamily: rg.font_family,
                fontStyle,
                textDecoration,
                align,
                lineHeight: rg.line_spacing,
                letterSpacing: rg.letter_spacing,
                direction,
                strokeColor: rg.stroke_color,
                strokeWidth: rg.stroke_width,
              };
            });
            setEditorRegions(newEditorRegions);
          }
          
          return updated;
        });
      } catch (e) {
        console.error("Failed to delete region", e);
      }
    },
    [editorMode, editorPages, editorPageIndex, editingId],
  );

  // Keyboard event listener for Delete key
  useEffect(() => {
    if (!editorMode) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Delete/Backspace if not typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && editingId) {
        e.preventDefault();
        void showConfirm({ title: "确认删除", message: "确定要删除这个文本框吗？", variant: "danger", confirmLabel: "删除" }).then((ok) => {
          if (ok) deleteRegion(editingId);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorMode, editingId, deleteRegion]);

  const updateRegionWithPatch = useCallback(
    (id: string, patch: Partial<EditorRegion>) => {
      // Optimistic update to editorRegions
      setEditorRegions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

      if (!editorMode) return;
      const page = editorPages[editorPageIndex];
      if (!page) return;

      const parts = id.split(":");
      const regionIdx = parseInt(parts[parts.length - 1], 10);
      if (isNaN(regionIdx)) return;

      // Convert frontend format to storage format
      const storagePatch: Record<string, unknown> = {};
      if (patch.text !== undefined) storagePatch.text_translated = patch.text;
      if (patch.box !== undefined) storagePatch.box = patch.box;
      if (patch.fontSize !== undefined) storagePatch.font_size = patch.fontSize;
      if (patch.fontFamily !== undefined) storagePatch.font_family = patch.fontFamily;
      if (patch.align !== undefined) storagePatch.alignment = patch.align;
      if (patch.direction !== undefined) storagePatch.direction = patch.direction;
      
      // Convert fill (rgb string) to fg_color ([r,g,b] array)
      if (patch.fill !== undefined) {
        const match = patch.fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          storagePatch.fg_color = [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
        } else if (patch.fill.startsWith("#")) {
          const hex = patch.fill.slice(1);
          if (hex.length === 6) {
            storagePatch.fg_color = [
              parseInt(hex.slice(0, 2), 16),
              parseInt(hex.slice(2, 4), 16),
              parseInt(hex.slice(4, 6), 16),
            ];
          }
        }
      }
      
      // Convert fontStyle to bold/italic flags
      if ("fontStyle" in patch) {
        storagePatch.bold = !!patch.fontStyle?.includes("bold");
        storagePatch.italic = !!patch.fontStyle?.includes("italic");
      }
      
      // Convert textDecoration to underline/strikethrough flags
      if ("textDecoration" in patch) {
        storagePatch.underline = !!patch.textDecoration?.includes("underline");
        storagePatch.strikethrough = !!patch.textDecoration?.includes("line-through");
      }
      
      // Convert lineHeight and letterSpacing
      if (patch.lineHeight !== undefined) storagePatch.line_spacing = patch.lineHeight;
      if (patch.letterSpacing !== undefined) storagePatch.letter_spacing = patch.letterSpacing;

      // Convert stroke
      if ("strokeColor" in patch) storagePatch.stroke_color = patch.strokeColor ?? undefined;
      if ("strokeWidth" in patch) storagePatch.stroke_width = patch.strokeWidth ?? undefined;

      try {
        persistPageUpdate(page.id, (p) => {
            const regs = (p.regions ?? []).slice();
            if (regs[regionIdx]) {
              regs[regionIdx] = { ...regs[regionIdx], ...storagePatch };
            }
            return { ...p, regions: regs };
          });

        setEditorPages((prev) =>
          prev.map((pp) => {
            if (pp.id !== page.id) return pp;
            const nextRegs = (pp.regions ?? []).slice();
            if (nextRegs[regionIdx]) {
              nextRegs[regionIdx] = { ...nextRegs[regionIdx], ...storagePatch };
            }
            return { ...pp, regions: nextRegs };
          }),
        );

        if (page.renderedBlobKey || page.renderedUrl) {
          setEditorDirtyRegionIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }
      } catch (e) {
        console.error("Failed to save region patch", e);
      }
    },
    [editorMode, editorPages, editorPageIndex, bookIdFromQuery, chapterIdFromQuery],
  );

  // Get selected region for EditorPanelRight
  const selectedRegion = useMemo(() => {
    if (!editingId) return null;
    return editorRegions.find((r) => r.id === editingId) || null;
  }, [editingId, editorRegions]);

  // Editor mode: use EditorLayout with three-column layout
  if (editorMode) {
    const handlePageSelect = (idx: number) => {
      if (idx === editorPageIndex) return;
      setEditorPageIndex(idx);
      void loadEditorPage(editorPages, idx).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err ?? "Failed");
        setEditorProjectError(message);
      });
    };

    const currentPage = editorPages[editorPageIndex];
    const currentTargetLangLabel = TARGET_LANGUAGE_OPTIONS.find((o) => o.value === targetLanguage)?.label ?? targetLanguage;

    const handleEditorBack = async () => {
      const ok = await showConfirm({ title: "确认返回", message: "确定要返回上级页面吗？" });
      if (!ok) return;
      // 返回前关闭进度弹窗
      setTranslationModalOpen(false);
      if (window.history.length > 1) {
        router.back();
        return;
      }
      router.push(`/shelf/${encodeURIComponent(bookIdFromQuery)}/${encodeURIComponent(chapterIdFromQuery)}`);
    };

    const handleEditorDownload = () => {
      if (!currentPage || !editorBaseUrl) return;
      const link = document.createElement("a");
      link.href = editorBaseUrl;
      link.download = currentPage.fileName || `page_${editorPageIndex + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <EditorLayout
        header={
          <EditorHeader
            pageIndex={editorPageIndex}
            totalPages={editorPages.length}
            fileName={currentPage?.fileName}
            sourceLanguage={detectedLang || undefined}
            targetLanguage={currentTargetLangLabel}
            showOriginal={editorShowOriginal}
            saving={editorSaving}
            saveProgress={editorSaveProgress}
            onBack={handleEditorBack}
            onPrevPage={() => handlePageSelect(Math.max(0, editorPageIndex - 1))}
            onNextPage={() => handlePageSelect(Math.min(editorPages.length - 1, editorPageIndex + 1))}
            onToggleOriginal={() => setEditorShowOriginal(!editorShowOriginal)}
            onRenderPreview={() => void applyBackendRender()}
            onDownload={handleEditorDownload}
            onSave={() => void saveToBookshelf()}
          />
        }
        left={
          <EditorNavLeft
            pages={editorPages}
            currentPageIndex={editorPageIndex}
            onPageSelect={handlePageSelect}
          />
        }
        middle={
          <>
            {editorProjectError && (
              <div className="absolute top-2 left-2 right-2 z-10 bg-red-100 border border-red-300 p-2 rounded text-xs text-red-700">
                {editorProjectError}
              </div>
            )}
            <EditorWorkspace
              imageUrl={editorShowOriginal ? originalUrl : editorBaseUrl}
              regions={editorRegions}
              selectedId={editingId}
              selectedIds={selectedIds}
              onSelect={(id, options) => {
                if (options?.ctrlKey && id) {
                  // Ctrl+click: toggle selection
                  setSelectedIds((prev) => {
                    const isRemoving = prev.includes(id);
                    const newIds = isRemoving ? prev.filter((i) => i !== id) : [...prev, id];
                    
                    // Update editingId based on remaining selection
                    if (isRemoving) {
                      // If removing, set editingId to last remaining item
                      const lastId = newIds.length > 0 ? newIds[newIds.length - 1] : null;
                      setEditingId(lastId);
                      if (lastId) {
                        const region = editorRegions.find((r) => r.id === lastId);
                        if (region) setEditingValue(region.text);
                      } else {
                        setEditingValue("");
                      }
                    } else {
                      // If adding, set editingId to the newly added item
                      setEditingId(id);
                      const region = editorRegions.find((r) => r.id === id);
                      if (region) setEditingValue(region.text);
                    }
                    
                    return newIds;
                  });
                } else {
                  // Normal click: single select
                  setSelectedIds(id ? [id] : []);
                  setEditingId(id);
                  if (id) {
                    const region = editorRegions.find((r) => r.id === id);
                    if (region) setEditingValue(region.text);
                  }
                }
              }}
              onSelectMultiple={(ids) => {
                setSelectedIds(ids);
                if (ids.length > 0) {
                  const lastId = ids[ids.length - 1];
                  setEditingId(lastId);
                  const region = editorRegions.find((r) => r.id === lastId);
                  if (region) setEditingValue(region.text);
                } else {
                  setEditingId(null);
                  setEditingValue("");
                }
              }}
              onChangeRegion={(id, newBox, newText) => updateRegion(id, newBox, newText)}
              scale={editorScale}
              setScale={setEditorScale}
              showOriginal={editorShowOriginal}
              onToggleOriginal={() => setEditorShowOriginal(!editorShowOriginal)}
              activeTool={editorActiveTool}
              onToolChange={setEditorActiveTool}
              onOcrRegion={handleOcrRegion}
              onInpaintRegion={handleInpaintRegion}
              imageNaturalSize={editorImgNatural}
            />
          </>
        }
        right={
          <EditorPanelRight
            selectedRegion={selectedRegion}
            selectedIds={selectedIds}
            allRegions={editorRegions}
            onRegionChange={updateRegionWithPatch}
            onBatchRegionChange={(ids, patch) => {
              ids.forEach((id) => updateRegionWithPatch(id, patch));
            }}
            onRegionSelect={(id) => {
              setEditingId(id);
              setSelectedIds([id]);
              const region = editorRegions.find((r) => r.id === id);
              if (region) setEditingValue(region.text);
            }}
            onRegionDelete={deleteRegion}
            onBatchDelete={(ids) => {
              ids.forEach((id) => deleteRegion(id));
              setSelectedIds([]);
              setEditingId(null);
              setEditingValue("");
            }}
            onReOcr={async (id) => {
              const region = editorRegions.find((r) => r.id === id);
              if (!region) return;
              const page = editorPages[editorPageIndex];
              if (!page?.originalBlobKey) {
                setEditorProjectError("缺少原始图片，无法重新识别");
                return;
              }
              try {
                const blob = await getBlob(page.originalBlobKey);
                if (!blob) throw new Error("无法读取原始图片");
                const formData = new FormData();
                formData.append("file", blob, "image.jpg");
                formData.append("x", String(region.box[0]));
                formData.append("y", String(region.box[1]));
                formData.append("width", String(region.box[2]));
                formData.append("height", String(region.box[3]));
                formData.append("ocr", ocrMode);
                formData.append("target_lang", targetLanguage);
                formData.append("translator", translator);
                formData.append("translate", "true");
                const res = await fetch(`${getBackendUrl()}/ocr_region`, { method: "POST", body: formData });
                const data = await res.json();
                if (data.status === "success") {
                  const resolvedDirection = normalizeDirection(data.direction, region.box);
                  const backendFontSize = data.font_size ? Number(data.font_size) : null;
                  const nextPatch: Partial<EditorRegion> = {
                    textOriginal: data.text_original || "",
                    text: data.text_translated || data.text_original || "",
                    direction: resolvedDirection,
                  };
                  if (backendFontSize && backendFontSize > 0) {
                    nextPatch.fontSize = backendFontSize;
                  }
                  updateRegionWithPatch(id, nextPatch);
                } else {
                  setEditorProjectError(data.message || "重新识别失败");
                }
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err ?? "重新识别失败");
                setEditorProjectError(message);
              }
            }}
            onRetranslate={async (id, originalText) => {
              if (!originalText.trim()) {
                void showAlert({ title: "提示", message: "原文为空，无法翻译" });
                return;
              }
              try {
                const response = await fetch(`${getBackendUrl()}/translate_text`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    text: originalText,
                    target_lang: targetLanguage || "CHS",
                    translator: translator || "youdao",
                  }),
                });
                const result = await response.json();
                if (result.status === "success" && result.translated_text) {
                  updateRegionWithPatch(id, { text: result.translated_text });
                } else {
                  void showAlert({ title: "翻译失败", message: result.message || "未知错误" });
                }
              } catch (err) {
                void showAlert({ title: "翻译失败", message: err instanceof Error ? err.message : String(err) });
              }
            }}
          />
        }
      />
    );
  }

  // Non-editor mode: batch translation UI
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      <TopBar title="翻译" right={right} />

      <main className="flex-1 overflow-auto p-4 custom-scrollbar">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff,.zip,.cbz,.cbr,.rar,.pdf,.epub,.mobi"
          className="hidden"
          multiple
          onChange={pickFiles}
        />

        <div className="max-w-[1100px] mx-auto space-y-4">
          {editorProjectError && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{editorProjectError}</div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">批量翻译</h2>
                <p className="text-xs text-slate-500 mt-1">选择图片/文件夹，选择输出目录后开始。结果将覆盖写入同名文件。</p>
              </div>
              <span className="text-xs text-slate-400 shrink-0">
                {files.length > 0 ? `任务：${importName}（${files.length} 张）` : "未导入"}
              </span>
            </div>

            <div className="mt-3">
              <button
                type="button"
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                disabled={status === "running"}
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "隐藏高级设置" : "显示高级设置"}
              </button>
            </div>

            {showAdvanced && (
              <div className="mt-3 bg-slate-50 rounded-xl border border-slate-100 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 mb-1 block">检测分辨率</label>
                    <CustomSelect
                      options={DETECTION_SIZE_OPTIONS.map((v) => ({ value: String(v), label: `${v}px` }))}
                      value={String(detectionResolution)}
                      onChange={(v) => setDetectionResolution(Number(v))}
                      disabled={status === "running"}
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 mb-1 block">文本检测器</label>
                    <CustomSelect
                      options={[
                        { value: "default", label: "默认" },
                        { value: "ctd", label: "CTD" },
                        { value: "paddle", label: "飞桨（paddle）" },
                      ]}
                      value={textDetector}
                      onChange={setTextDetector}
                      disabled={status === "running"}
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 mb-1 block">修复尺寸</label>
                    <CustomSelect
                      options={INPAINTING_SIZE_OPTIONS.map((v) => ({ value: String(v), label: `${v}px` }))}
                      value={String(inpaintingSize)}
                      onChange={(v) => setInpaintingSize(Number(v))}
                      disabled={status === "running"}
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 mb-1 block">翻译器</label>
                    <CustomSelect
                      options={VALID_TRANSLATORS.map((k) => ({ value: k, label: k }))}
                      value={translator}
                      onChange={setTranslator}
                      disabled={status === "running"}
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 mb-1 block">目标语言</label>
                    <CustomSelect
                      options={TARGET_LANGUAGE_OPTIONS}
                      value={targetLanguage}
                      onChange={setTargetLanguage}
                      disabled={status === "running"}
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 mb-1 block">修复器</label>
                    <CustomSelect
                      options={[
                        { value: "lama_mpe", label: "lama_mpe" },
                        { value: "lama_large", label: "lama_large" },
                      ]}
                      value={inpainter}
                      onChange={setInpainter}
                      disabled={status === "running"}
                      size="sm"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 mb-1 block">OCR</label>
                    <CustomSelect
                      options={OCR_OPTIONS}
                      value={ocrMode}
                      onChange={setOcrMode}
                      disabled={status === "running"}
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            )}

            <div
              className="mt-4 border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => void dropImport(e)}
            >
              将图片/文件夹/压缩包（.zip/.cbz/.cbr/.rar）/PDF（.pdf）/EPUB（.epub）/MOBI（.mobi）拖到这里导入；也可以点击顶部“导入”选择。
            </div>

            <div className="mt-3 text-xs text-slate-500">
              输出目录：{outputDir ? (outputDirName || "已选择") : "未选择"}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              保存到：{outputDir && importName ? `${outputDirName || "输出目录"}/${importName}` : "-"}
            </div>

            {status === "error" && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{error}</div>
            )}

            {status === "done" && (
              <div className="mt-3 text-xs text-slate-500">
                当前页识别到 {regionsCount} 个文本区域
              </div>
            )}

            {(detectedLang || usedOcr) && (
              <div className="mt-2 text-xs text-slate-400">
                当前页：detected={detectedLang || "-"} / ocr={usedOcr || "-"}
              </div>
            )}

            <div className="mt-3 text-xs text-slate-500">
              进度：{completed}/{files.length}（当前 {Math.min(currentIndex + 1, Math.max(1, files.length))}/{Math.max(1, files.length)}）
            </div>

            {files.length > 0 && (
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${files.length > 0 ? Math.round((completed / files.length) * 100) : 0}%` }} />
              </div>
            )}

            {translatedUrl && (
              <div className="mt-4 flex items-center gap-2">
                <a href={translatedUrl} download={outputFileName} className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors inline-block">
                  下载译图
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 mb-2">原图</h3>
              <div className="bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                {originalUrl ? (
                  <img src={originalUrl} alt={files[0]?.name ?? "original"} className="w-full h-auto" />
                ) : (
                  <div className="p-6 text-xs text-slate-400 text-center">请选择一张图片</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 mb-2">译图</h3>
              <div className="bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                {editorBaseUrl && editorImgNatural ? (
                  <div ref={editorWrapRef} className="relative w-full">
                    <canvas ref={editorCanvasRef} className="w-full h-auto block" />
                    <div className="absolute inset-0">
                      {(() => {
                        const wrap = editorWrapRef.current;
                        const cw = wrap?.clientWidth ?? 0;
                        const scale = editorImgNatural ? (cw > 0 ? cw / editorImgNatural[0] : 1) : 1;
                        return editorRegions.map((r) => {
                          const [x, y, w, h] = r.box;
                          const isEditing = editingId === r.id;

                          const normalizedDirection = String(r.direction || "").trim().toLowerCase();
                          const isVerticalText = normalizedDirection === "vertical" || normalizedDirection === "v" || normalizedDirection === "vr";

                          const imgW = editorImgNatural?.[0] ?? 0;
                          const imgH = editorImgNatural?.[1] ?? 0;

                          const pad = isEditing ? Math.max(6, Math.min(24, Math.round(Math.min(w, h) * 0.12))) : 0;
                          const x0 = imgW > 0 ? Math.max(0, x - pad) : x - pad;
                          const y0 = imgH > 0 ? Math.max(0, y - pad) : y - pad;
                          const x1 = imgW > 0 ? Math.min(imgW, x + w + pad) : x + w + pad;
                          const y1 = imgH > 0 ? Math.min(imgH, y + h + pad) : y + h + pad;
                          const w0 = Math.max(1, x1 - x0);
                          const h0 = Math.max(1, y1 - y0);

                          const sx = x0 * scale;
                          const sy = y0 * scale;
                          const sw = w0 * scale;
                          const sh = h0 * scale;
                          return (
                            <div
                              key={r.id}
                              style={{ position: "absolute", left: sx, top: sy, width: sw, height: sh }}
                              onDoubleClick={() => {
                                setEditingId(r.id);
                                setEditingValue(r.text);

                                if (editorUseBackendPreview) {
                                  const clean = editorUrlRef.current.base || translatedUrl || null;
                                  setEditorUseBackendPreview(false);
                                  setEditorBaseUrl(clean);
                                }
                              }}
                              className="relative border border-black/10 overflow-visible"
                            >
                              {isEditing && (
                                <>
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      zIndex: 0,
                                      pointerEvents: "none",
                                      backgroundColor: "white",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {(() => {
                                      const cropBase = editorUrlRef.current.base || translatedUrl;
                                      const cropW = editorImgNatural ? editorImgNatural[0] * scale : 0;
                                      const cropH = editorImgNatural ? editorImgNatural[1] * scale : 0;
                                      return cropBase && cropW > 0 && cropH > 0 ? (
                                        <img
                                          src={cropBase}
                                          alt=""
                                          draggable={false}
                                          style={{
                                            position: "absolute",
                                            left: -sx,
                                            top: -sy,
                                            width: cropW,
                                            height: cropH,
                                            maxWidth: "none",
                                          }}
                                        />
                                      ) : null;
                                    })()}
                                  </div>
                                  <textarea
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={() => {
                                    setEditorRegions((prev) => prev.map((it) => (it.id === r.id ? { ...it, text: editingValue } : it)));
                                    if (editorMode) {
                                      const page = editorPages[editorPageIndex];
                                      if (page) {
                                        try {
                                          persistPageUpdate(page.id, (p) => {
                                              const regs = (p.regions ?? []).slice();
                                              if (regs[r.regionIndex]) {
                                                regs[r.regionIndex] = { ...regs[r.regionIndex], text_translated: editingValue };
                                              }
                                              return { ...p, regions: regs };
                                            });
                                          setEditorPages((prev) =>
                                            prev.map((pp) =>
                                              pp.id === page.id
                                                ? {
                                                    ...pp,
                                                    regions: (pp.regions ?? []).map((rg, ri) =>
                                                      ri === r.regionIndex ? { ...rg, text_translated: editingValue } : rg,
                                                    ),
                                                  }
                                                : pp,
                                            ),
                                          );
                                        } catch {
                                          // ignore
                                        }
                                      }
                                    }
                                    const page = editorPages[editorPageIndex];
                                    if (page?.renderedBlobKey || page?.renderedUrl) {
                                      const baseline = editorBackendBaselineRef.current[r.id] ?? r.text;
                                      setEditorDirtyRegionIds((prev) => {
                                        const next = new Set(prev);
                                        if (editingValue !== baseline) next.add(r.id);
                                        else next.delete(r.id);
                                        return next;
                                      });
                                    }
                                    setEditingId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                      setEditorRegions((prev) => prev.map((it) => (it.id === r.id ? { ...it, text: editingValue } : it)));
                                      if (editorMode) {
                                        const page = editorPages[editorPageIndex];
                                        if (page) {
                                          try {
                                            persistPageUpdate(page.id, (p) => {
                                                const regs = (p.regions ?? []).slice();
                                                if (regs[r.regionIndex]) {
                                                  regs[r.regionIndex] = { ...regs[r.regionIndex], text_translated: editingValue };
                                                }
                                                return { ...p, regions: regs };
                                              });
                                            setEditorPages((prev) =>
                                              prev.map((pp) =>
                                                pp.id === page.id
                                                  ? {
                                                      ...pp,
                                                      regions: (pp.regions ?? []).map((rg, ri) =>
                                                        ri === r.regionIndex ? { ...rg, text_translated: editingValue } : rg,
                                                      ),
                                                    }
                                                  : pp,
                                              ),
                                            );
                                          } catch {
                                            // ignore
                                          }
                                        }
                                      }
                                      const page = editorPages[editorPageIndex];
                                      if (page?.renderedBlobKey || page?.renderedUrl) {
                                        const baseline = editorBackendBaselineRef.current[r.id] ?? r.text;
                                        setEditorDirtyRegionIds((prev) => {
                                          const next = new Set(prev);
                                          if (editingValue !== baseline) next.add(r.id);
                                          else next.delete(r.id);
                                          return next;
                                        });
                                      }
                                      setEditingId(null);
                                    }
                                    if (e.key === "Escape") {
                                      setEditingId(null);
                                    }
                                  }}
                                  autoFocus
                                  className={`relative w-full h-full text-xs p-1 bg-transparent outline-none resize-none ${
                                    isVerticalText ? "overflow-x-visible overflow-y-hidden" : "overflow-y-visible overflow-x-hidden"
                                  }`}
                                  style={{ zIndex: 1 }}
                                  />
                                </>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    {/* Legacy export button removed during refactoring */}
                    <div className="text-[10px] text-black/60 mt-2">预览模式（仅供查看）</div>
                  </div>
                ) : (
                  <div className="p-6 text-xs font-black text-black/60">等待任务开始...</div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-700 mb-2">队列</h3>
            <div className="space-y-2">
              {queue.length === 0 && <div className="text-xs text-slate-400">暂无任务</div>}
              {queue.map((it, idx) => {
                const active = idx === currentIndex && status === "running";
                const Icon = it.status === "success" ? CheckCircle2 : it.status === "error" ? XCircle : LoaderCircle;
                return (
                  <div
                    key={it.id}
                    className={`rounded-lg border p-3 transition-colors ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-800 border-slate-100"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className={`text-[10px] font-bold ${active ? "text-white/80" : "text-slate-400"}`}>
                          #{String(idx + 1).padStart(3, "0")}
                        </div>
                        <div className={`text-xs font-bold mt-1 ${active ? "text-white" : "text-slate-800"}`}>{it.file.name}</div>
                        {it.detectedLang && (
                          <div className={`text-[10px] mt-1 ${active ? "text-white/80" : "text-slate-400"}`}>
                            {it.detectedLang} / {it.usedOcr ?? "-"}
                          </div>
                        )}
                        {it.status === "error" && it.error && (
                          <div className={`text-[10px] mt-1 ${active ? "text-white/80" : "text-red-500"}`}>{it.error}</div>
                        )}
                      </div>
                      <Icon className={`h-4 w-4 ${it.status === "running" ? "animate-spin" : ""}`} aria-hidden="true" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TranslatePage() {
  return (
    <Suspense>
      <TranslatePageInner />
    </Suspense>
  );
}
