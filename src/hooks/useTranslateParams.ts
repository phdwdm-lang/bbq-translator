import { useCallback, useRef, useState } from "react";
import { DETECTION_RESOLUTION, INPAINTING_SIZE } from "../constants/editor";

const STORAGE_KEY = "bbq_translate_params";

interface SavedParams {
  lang?: string;
  inpainter?: string;
  detectionResolution?: number;
  textDetector?: string;
  translator?: string;
  targetLanguage?: string;
  inpaintingSize?: number;
  ocrMode?: string;
}

function loadSaved(): SavedParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function usePersistedState<T>(key: keyof SavedParams, defaultValue: T, savedRef: React.MutableRefObject<SavedParams>) {
  const [value, setValue] = useState<T>(() => {
    const saved = savedRef.current[key];
    return saved !== undefined ? (saved as T) : defaultValue;
  });

  const setAndPersist = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (prev: T) => T)(prev) : v;
      try {
        const current = loadSaved();
        current[key] = next as never;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch { /* ignore */ }
      return next;
    });
  }, [key]);

  return [value, setAndPersist] as const;
}

export function useTranslateParams() {
  const savedRef = useRef(loadSaved());

  const [lang, setLang] = usePersistedState("lang", "auto", savedRef);
  const [inpainter, setInpainter] = usePersistedState("inpainter", "none", savedRef);
  const [detectionResolution, setDetectionResolution] = usePersistedState("detectionResolution", DETECTION_RESOLUTION, savedRef);
  const [textDetector, setTextDetector] = usePersistedState("textDetector", "ctd", savedRef);
  const [translator, setTranslator] = usePersistedState("translator", "deepseek", savedRef);
  const [targetLanguage, setTargetLanguage] = usePersistedState("targetLanguage", "CHS", savedRef);
  const [inpaintingSize, setInpaintingSize] = usePersistedState("inpaintingSize", INPAINTING_SIZE, savedRef);
  const [ocrMode, setOcrMode] = usePersistedState("ocrMode", "auto", savedRef);
  const [showAdvanced, setShowAdvanced] = useState(false);

  return {
    lang,
    setLang,
    inpainter,
    setInpainter,
    detectionResolution,
    setDetectionResolution,
    textDetector,
    setTextDetector,
    translator,
    setTranslator,
    targetLanguage,
    setTargetLanguage,
    inpaintingSize,
    setInpaintingSize,
    ocrMode,
    setOcrMode,
    showAdvanced,
    setShowAdvanced,
  };
}

export type TranslateParams = ReturnType<typeof useTranslateParams>;
