"use client";

import { useState } from "react";
import { X, ChevronRight, Settings as SettingsIcon } from "lucide-react";
import { SOURCE_LANGUAGE_OPTIONS, TARGET_LANGUAGE_OPTIONS } from "../../constants/languages";
import { LanguageSelect } from "./LanguageSelect";
import { CustomSelect } from "./CustomSelect";
import { AdvancedTranslateSettings } from "./AdvancedTranslateSettings";

interface AdvancedSettings {
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

interface TranslateModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;

  sourceLang: string;
  onSourceLangChange: (lang: string) => void;
  targetLang: string;
  onTargetLangChange: (lang: string) => void;
  defaultLang: string;
  onDefaultLangChange: (lang: string) => void;
  langDisabled?: boolean;

  advanced: AdvancedSettings;
  advancedDisabled?: boolean;

  error?: string;
  warning?: string;

  autoTranslateDisabled?: boolean;
  onAutoTranslate: () => void;
  editorDisabled?: boolean;
  onEditorTranslate: () => void;
  loading?: boolean;
}

export function TranslateModal({
  open,
  onClose,
  title,
  children,
  sourceLang,
  onSourceLangChange,
  targetLang,
  onTargetLangChange,
  defaultLang,
  onDefaultLangChange,
  langDisabled = false,
  advanced,
  advancedDisabled = false,
  error,
  warning,
  autoTranslateDisabled = false,
  onAutoTranslate,
  editorDisabled = false,
  onEditorTranslate,
  loading = false,
}: TranslateModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setShowAdvanced(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button
            type="button"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            onClick={handleClose}
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {children}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">源语言</label>
              <CustomSelect
                options={SOURCE_LANGUAGE_OPTIONS}
                value={sourceLang}
                onChange={onSourceLangChange}
                disabled={langDisabled}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">目标语言</label>
              <LanguageSelect
                options={TARGET_LANGUAGE_OPTIONS}
                value={targetLang}
                onChange={onTargetLangChange}
                disabled={langDisabled}
                defaultLang={defaultLang}
                onDefaultLangChange={onDefaultLangChange}
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setShowAdvanced((v) => !v)}
              disabled={advancedDisabled}
            >
              <span className="text-xs text-indigo-600 font-bold flex items-center gap-1.5">
                <SettingsIcon className="w-3.5 h-3.5" /> 高级选项
              </span>
              <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`} />
            </button>
            {showAdvanced && (
              <div className="px-4 pb-4 border-t border-slate-100">
                <AdvancedTranslateSettings
                  detectionSize={advanced.detectionSize}
                  inpaintingSize={advanced.inpaintingSize}
                  detector={advanced.detector}
                  translator={advanced.translator}
                  inpainter={advanced.inpainter}
                  ocrMode={advanced.ocrMode}
                  onDetectionSizeChange={advanced.onDetectionSizeChange}
                  onInpaintingSizeChange={advanced.onInpaintingSizeChange}
                  onDetectorChange={advanced.onDetectorChange}
                  onTranslatorChange={advanced.onTranslatorChange}
                  onInpainterChange={advanced.onInpainterChange}
                  onOcrModeChange={advanced.onOcrModeChange}
                  installedExtensions={advanced.installedExtensions}
                  onRequireExtension={advanced.onRequireExtension}
                />
              </div>
            )}
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
          {warning && <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-600 font-medium">{warning}</div>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white rounded-xl font-bold shadow-md shadow-indigo-200/50 flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              disabled={autoTranslateDisabled}
              onClick={onAutoTranslate}
            >
              <span className="text-sm">{loading ? "开始中…" : "自动翻译"}</span>
              <span className="text-[10px] opacity-75 font-normal">直接生成结果</span>
            </button>
            <button
              type="button"
              className="py-3 bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl font-bold flex flex-col items-center justify-center gap-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              disabled={editorDisabled}
              onClick={onEditorTranslate}
            >
              <span className="text-sm">我自己来</span>
              <span className="text-[10px] opacity-50 font-normal">进入编辑器微调</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
