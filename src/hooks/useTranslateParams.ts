import { useState } from "react";
import { DETECTION_RESOLUTION, INPAINTING_SIZE } from "../constants/editor";

export function useTranslateParams() {
  const [lang, setLang] = useState<string>("auto");
  const [inpainter, setInpainter] = useState<string>("none");
  const [detectionResolution, setDetectionResolution] = useState<number>(DETECTION_RESOLUTION);
  const [textDetector, setTextDetector] = useState<string>("ctd");
  const [translator, setTranslator] = useState<string>("deepseek");
  const [targetLanguage, setTargetLanguage] = useState<string>("CHS");
  const [inpaintingSize, setInpaintingSize] = useState<number>(INPAINTING_SIZE);
  const [ocrMode, setOcrMode] = useState<string>("auto");
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
