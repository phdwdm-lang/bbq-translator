import { useState, useRef, useCallback } from "react";
import type { EditorRegion, EditorTool } from "../types/editor";
import type { MangaPage } from "../lib/storage";

export function useEditorState() {
  const [editorPages, setEditorPages] = useState<MangaPage[]>([]);
  const [editorPageIndex, setEditorPageIndex] = useState<number>(0);
  const [editorBaseUrl, setEditorBaseUrl] = useState<string | null>(null);
  const [editorRegions, setEditorRegions] = useState<EditorRegion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editorImgNatural, setEditorImgNatural] = useState<[number, number] | null>(null);
  const [editorScale, setEditorScale] = useState<number>(1);
  const [editorProjectError, setEditorProjectError] = useState<string>("");
  const [editorShowOriginal, setEditorShowOriginal] = useState<boolean>(false);
  const [editorSaving, setEditorSaving] = useState<boolean>(false);
  const [editorSaveProgress, setEditorSaveProgress] = useState<string>("");
  const [editorUseBackendPreview, setEditorUseBackendPreview] = useState<boolean>(false);
  const [editorDirtyRegionIds, setEditorDirtyRegionIds] = useState<Set<string>>(() => new Set());
  const [editorActiveTool, setEditorActiveTool] = useState<EditorTool>("select");

  const editorWrapRef = useRef<HTMLDivElement | null>(null);
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorRenderSeqRef = useRef(0);
  const editorUrlRef = useRef<{ original?: string; base?: string; rendered?: string }>({});
  const editorBackendBaselineRef = useRef<Record<string, string>>({});

  const revokeEditorUrls = useCallback(() => {
    const prevOriginal = editorUrlRef.current.original;
    const prevBase = editorUrlRef.current.base;
    const prevRendered = editorUrlRef.current.rendered;
    if (prevOriginal?.startsWith("blob:")) URL.revokeObjectURL(prevOriginal);
    if (prevBase?.startsWith("blob:")) URL.revokeObjectURL(prevBase);
    if (prevRendered?.startsWith("blob:")) URL.revokeObjectURL(prevRendered);
    editorUrlRef.current = {};
  }, []);

  const currentPage = editorPages[editorPageIndex] || null;

  return {
    editorPages,
    setEditorPages,
    editorPageIndex,
    setEditorPageIndex,
    editorBaseUrl,
    setEditorBaseUrl,
    editorRegions,
    setEditorRegions,
    editingId,
    setEditingId,
    editingValue,
    setEditingValue,
    editorImgNatural,
    setEditorImgNatural,
    editorScale,
    setEditorScale,
    editorProjectError,
    setEditorProjectError,
    editorShowOriginal,
    setEditorShowOriginal,
    editorSaving,
    setEditorSaving,
    editorSaveProgress,
    setEditorSaveProgress,
    editorUseBackendPreview,
    setEditorUseBackendPreview,
    editorDirtyRegionIds,
    setEditorDirtyRegionIds,
    editorWrapRef,
    editorCanvasRef,
    editorRenderSeqRef,
    editorUrlRef,
    editorBackendBaselineRef,
    revokeEditorUrls,
    currentPage,
    editorActiveTool,
    setEditorActiveTool,
  };
}

export type EditorState = ReturnType<typeof useEditorState>;
