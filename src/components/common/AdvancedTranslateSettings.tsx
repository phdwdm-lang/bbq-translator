"use client";

import { useMemo } from "react";
import { DETECTION_SIZE_OPTIONS, INPAINTING_SIZE_OPTIONS } from "../../constants/editor";
import { CustomSelect } from "./CustomSelect";

const DETECTOR_OPTIONS = ["default", "ctd", "paddle"] as const;

const TRANSLATOR_OPTIONS = [
  "deepseek",
  "google",
  "youdao",
  "baidu",
  "deepl",
  "papago",
  "caiyun",
  "chatgpt",
  "chatgpt_2stage",
  "gemini",
  "gemini_2stage",
  "groq",
  "none",
  "original",
] as const;

const INPAINTER_VALUES = ["none", "original", "lama_mpe", "lama_large"] as const;

const OCR_BASE_OPTIONS = [
  { value: "auto", label: "Auto（推荐）" },
  { value: "mocr", label: "MangaOCR（mocr）" },
  { value: "48px_ctc", label: "48px_ctc" },
  { value: "48px", label: "48px" },
  { value: "32px", label: "32px" },
] as const;

const DETECTION_SELECT_OPTIONS = DETECTION_SIZE_OPTIONS.map((v) => ({ value: String(v), label: String(v) }));
const INPAINTING_SELECT_OPTIONS = INPAINTING_SIZE_OPTIONS.map((v) => ({ value: String(v), label: String(v) }));
const DETECTOR_SELECT_OPTIONS = DETECTOR_OPTIONS.map((v) => ({ value: v, label: v }));
const TRANSLATOR_SELECT_OPTIONS = TRANSLATOR_OPTIONS.map((v) => ({ value: v, label: v }));

const LABEL_CLASS = "text-xs font-semibold text-slate-500 mb-1.5 block";

interface AdvancedTranslateSettingsProps {
  detectionSize: number;
  inpaintingSize: number;
  detector: string;
  translator: string;
  inpainter: string;
  ocrMode: string;
  onDetectionSizeChange: (v: number) => void;
  onInpaintingSizeChange: (v: number) => void;
  onDetectorChange: (v: string) => void;
  onTranslatorChange: (v: string) => void;
  onInpainterChange: (v: string) => void;
  onOcrModeChange: (v: string) => void;
  installedExtensions?: Map<string, boolean>;
  onRequireExtension?: (extId: string, title: string) => boolean;
}

export function AdvancedTranslateSettings({
  detectionSize,
  inpaintingSize,
  detector,
  translator,
  inpainter,
  ocrMode,
  onDetectionSizeChange,
  onInpaintingSizeChange,
  onDetectorChange,
  onTranslatorChange,
  onInpainterChange,
  onOcrModeChange,
  installedExtensions,
  onRequireExtension,
}: AdvancedTranslateSettingsProps) {
  const handleInpainterChange = (v: string) => {
    if (v === "lama_large" && onRequireExtension) {
      if (!onRequireExtension("lama_large", "LaMa Large")) return;
    }
    onInpainterChange(v);
  };

  const handleOcrChange = (v: string) => {
    if (v === "mocr" && onRequireExtension) {
      if (!onRequireExtension("mocr", "MangaOCR")) return;
    }
    onOcrModeChange(v);
  };

  const hasExt = (id: string) => installedExtensions?.get(id) ?? true;

  const inpainterOptions = useMemo(() =>
    INPAINTER_VALUES.map((v) => ({
      value: v,
      label: v === "lama_large" && !hasExt("lama_large") ? `${v}（需下载）` : v,
      disabled: v === "lama_large" && !hasExt("lama_large"),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installedExtensions],
  );

  const ocrOptions = useMemo(() =>
    OCR_BASE_OPTIONS.map((o) => ({
      value: o.value,
      label: o.value === "mocr" && !hasExt("mocr") ? `${o.label}（需下载）` : o.label,
      disabled: o.value === "mocr" && !hasExt("mocr"),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installedExtensions],
  );

  return (
    <div className="mt-3 bg-slate-50 rounded-xl border border-slate-100 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS}>检测分辨率</label>
          <CustomSelect
            options={DETECTION_SELECT_OPTIONS}
            value={String(detectionSize)}
            onChange={(v) => onDetectionSizeChange(Number(v))}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>修复尺寸</label>
          <CustomSelect
            options={INPAINTING_SELECT_OPTIONS}
            value={String(inpaintingSize)}
            onChange={(v) => onInpaintingSizeChange(Number(v))}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>文本检测器</label>
          <CustomSelect
            options={DETECTOR_SELECT_OPTIONS}
            value={detector}
            onChange={onDetectorChange}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>翻译器</label>
          <CustomSelect
            options={TRANSLATOR_SELECT_OPTIONS}
            value={translator}
            onChange={onTranslatorChange}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>修复器</label>
          <CustomSelect
            options={inpainterOptions}
            value={inpainter}
            onChange={handleInpainterChange}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>OCR</label>
          <CustomSelect
            options={ocrOptions}
            value={ocrMode}
            onChange={handleOcrChange}
          />
        </div>
      </div>
    </div>
  );
}
