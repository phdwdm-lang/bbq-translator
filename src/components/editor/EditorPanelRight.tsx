import { useState, useRef, useEffect } from "react";
import { Settings, Type, Trash2, RefreshCw, MoveHorizontal, MoveVertical, ScanText, Baseline, Space } from "lucide-react";
import type { EditorRegion } from "../../types/editor";
import { useFontOptions } from "../../hooks/useFontOptions";
import { TextFormattingToolbar, BatchTextFormattingToolbar } from "./TextFormattingToolbar";
import { StrokeSection } from "./StrokeSection";
import { CustomSelect } from "../common/CustomSelect";
import { useDialog } from "../common/DialogProvider";

const TARGET_LANG_OPTIONS = [
  { value: "CHS", label: "简体中文" },
  { value: "ENG", label: "English" },
  { value: "JPN", label: "日本語" },
];

const DETECTION_SIZE_OPTIONS = [
  { value: "1024", label: "1024px" },
  { value: "1536", label: "1536px (推荐)" },
  { value: "2048", label: "2048px" },
];

const DETECTOR_OPTIONS = [
  { value: "ctd", label: "CTD (推荐)" },
  { value: "craft", label: "CRAFT" },
  { value: "default", label: "Default" },
];

const TRANSLATOR_OPTIONS = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "openai", label: "OpenAI" },
  { value: "有道翻译", label: "有道翻译" },
];

const INPAINTER_OPTIONS = [
  { value: "lama_mpe", label: "Lama MPE (推荐)" },
  { value: "lama_large", label: "Lama Large" },
];

const INPAINT_SIZE_OPTIONS = [
  { value: "1024", label: "1024px" },
  { value: "2048", label: "2048px (推荐)" },
  { value: "4096", label: "4096px" },
];

const COLOR_PRESETS = [
  { color: "#000000", border: "border-slate-200" },
  { color: "#FFFFFF", border: "border-slate-300" },
  { color: "#EF4444", border: "border-transparent" },
  { color: "#3B82F6", border: "border-transparent" },
  { color: "#22C55E", border: "border-transparent" },
  { color: "#EAB308", border: "border-transparent" },
  { color: "#A855F7", border: "border-transparent" },
] as const;

interface EditorPanelRightProps {
  selectedRegion: EditorRegion | null;
  selectedIds: string[];
  allRegions: EditorRegion[];
  onRegionChange: (id: string, patch: Partial<EditorRegion>) => void;
  onBatchRegionChange: (ids: string[], patch: Partial<EditorRegion>) => void;
  onRegionSelect: (id: string) => void;
  onRegionDelete: (id: string) => void;
  onBatchDelete: (ids: string[]) => void;
  onRetranslate?: (id: string, originalText: string) => void;
  onReOcr?: (id: string) => void;
}

export function EditorPanelRight({ selectedRegion, selectedIds, allRegions, onRegionChange, onBatchRegionChange, onRegionSelect, onRegionDelete, onBatchDelete, onRetranslate, onReOcr }: EditorPanelRightProps) {
  const isMultiSelect = selectedIds.length > 1;
  const [activeTab, setActiveTab] = useState<"global" | "text">("text");
  const selectedRegionRef = useRef<HTMLDivElement>(null);
  const { fontOptions, defaultFontValue, ensureRegionFont } = useFontOptions(allRegions, onRegionChange);
  const { confirm } = useDialog();
  const [fontSizeDraft, setFontSizeDraft] = useState<string>("");

  useEffect(() => {
    if (!selectedRegion) {
      setFontSizeDraft("");
      return;
    }
    setFontSizeDraft(String(selectedRegion.fontSize || 16));
  }, [selectedRegion?.id, selectedRegion?.fontSize]);

  const commitFontSize = (raw: string) => {
    if (!selectedRegion) return;
    const text = (raw ?? "").trim();
    const isValid = /^\d+$/.test(text);
    const next = isValid ? parseInt(text, 10) : NaN;
    if (!Number.isFinite(next) || next <= 0) {
      setFontSizeDraft(String(selectedRegion.fontSize || 16));
      return;
    }
    onRegionChange(selectedRegion.id, { fontSize: next });
    setFontSizeDraft(String(next));
  };

  // Auto-scroll to selected region when it changes
  useEffect(() => {
    if (selectedRegion && selectedRegionRef.current) {
      selectedRegionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedRegion?.id]);

  useEffect(() => {
    ensureRegionFont(selectedRegion);
  }, [selectedRegion?.id, selectedRegion?.fontFamily, fontOptions, defaultFontValue, ensureRegionFont, selectedRegion]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 shrink-0">
        <button
          onClick={() => setActiveTab("global")}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${
            activeTab === "global" ? "text-indigo-600 border-indigo-600" : "text-slate-500 hover:text-slate-700 border-transparent"
          }`}
        >
          <Settings className="w-4 h-4" />
          全局设置
        </button>
        <button
          onClick={() => setActiveTab("text")}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${
            activeTab === "text" ? "text-indigo-600 border-indigo-600" : "text-slate-500 hover:text-slate-700 border-transparent"
          }`}
        >
          <Type className="w-4 h-4" />
          文本编辑
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === "global" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">翻译控制</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-1 block">目标语言</label>
                  <CustomSelect options={TARGET_LANG_OPTIONS} value="CHS" onChange={() => {}} size="sm" />
                </div>
                
                <button className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm transition-colors">
                  全局翻译 (所有页)
                </button>
                <button className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 shadow-sm transition-colors">
                  仅翻译当前页
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">高级设置</h3>
                <Settings className="w-3 h-3 text-slate-400" />
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 mb-1 block">检测分辨率</label>
                  <CustomSelect options={DETECTION_SIZE_OPTIONS} value="1536" onChange={() => {}} size="sm" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 mb-1 block">文本检测器</label>
                  <CustomSelect options={DETECTOR_OPTIONS} value="ctd" onChange={() => {}} size="sm" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 mb-1 block">翻译引擎</label>
                  <CustomSelect options={TRANSLATOR_OPTIONS} value="deepseek" onChange={() => {}} size="sm" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 mb-1 block">修图模型</label>
                  <CustomSelect options={INPAINTER_OPTIONS} value="lama_mpe" onChange={() => {}} size="sm" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 mb-1 block">修复尺寸</label>
                  <CustomSelect options={INPAINT_SIZE_OPTIONS} value="2048" onChange={() => {}} size="sm" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "text" && (
          <div className="space-y-3">
            {allRegions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-xs">
                <Type className="w-8 h-8 mb-2 opacity-20" />
                <p>当前页面没有文本框</p>
              </div>
            ) : isMultiSelect ? (
              /* Multi-select mode: show batch operations */
              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Type className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-indigo-700">已选中 {selectedIds.length} 个文本框</p>
                        <p className="text-[10px] text-indigo-500">批量编辑模式</p>
                      </div>
                    </div>
                    <button
                      className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                      title="删除选中的文本框"
                      onClick={async () => {
                        const ok = await confirm({ 
                          title: "批量删除", 
                          message: `确定要删除选中的 ${selectedIds.length} 个文本框吗？此操作不可撤销。`, 
                          variant: "danger", 
                          confirmLabel: "删除全部" 
                        });
                        if (ok) onBatchDelete(selectedIds);
                      }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Batch style settings */}
                {selectedRegion && (
                  <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">样式设置</label>
                      <button
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium"
                        onClick={() => {
                          onBatchRegionChange(selectedIds, {
                            fontSize: 16,
                            fontFamily: defaultFontValue,
                            fontStyle: undefined,
                            textDecoration: undefined,
                            fill: "#000000",
                            align: "left",
                            lineHeight: undefined,
                            letterSpacing: undefined,
                            direction: "horizontal",
                            strokeColor: undefined,
                            strokeWidth: undefined,
                          });
                        }}
                      >重置样式</button>
                    </div>

                    {/* Text Formatting Toolbar */}
                    <BatchTextFormattingToolbar selectedIds={selectedIds} selectedRegion={selectedRegion} onBatchRegionChange={onBatchRegionChange} />

                    {/* Font & Size Row */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 mb-1 block">字体</label>
                        <CustomSelect
                          options={fontOptions}
                          value={fontOptions.some((o) => o.value === (selectedRegion.fontFamily || defaultFontValue)) ? (selectedRegion.fontFamily || defaultFontValue) : defaultFontValue}
                          onChange={(v) => onBatchRegionChange(selectedIds, { fontFamily: v })}
                          size="sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">字号</label>
                        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-slate-300 focus-within:border-indigo-500 transition-colors">
                          <button
                            type="button"
                            className="w-7 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-r border-slate-200"
                            onClick={() => {
                              const next = Math.max(1, (selectedRegion.fontSize || 16) - 1);
                              onBatchRegionChange(selectedIds, { fontSize: next });
                            }}
                          >-</button>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="flex-1 p-1 text-xs text-center outline-none w-full min-w-0"
                            value={fontSizeDraft}
                            onChange={(e) => setFontSizeDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const next = parseInt(fontSizeDraft, 10);
                                if (next > 0) onBatchRegionChange(selectedIds, { fontSize: next });
                              }
                            }}
                            onBlur={() => {
                              const next = parseInt(fontSizeDraft, 10);
                              if (next > 0) onBatchRegionChange(selectedIds, { fontSize: next });
                            }}
                          />
                          <button
                            type="button"
                            className="w-7 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-l border-slate-200"
                            onClick={() => {
                              const next = (selectedRegion.fontSize || 16) + 1;
                              onBatchRegionChange(selectedIds, { fontSize: next });
                            }}
                          >+</button>
                        </div>
                      </div>
                    </div>

                    {/* Color Section */}
                    <div>
                      <label className="text-[10px] text-slate-500 mb-2 block">文字颜色</label>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <input
                            type="color"
                            value={selectedRegion.fill || "#000000"}
                            onChange={(e) => onBatchRegionChange(selectedIds, { fill: e.target.value })}
                            className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer"
                          />
                        </div>
                        <div className="flex gap-1">
                          {COLOR_PRESETS.map((preset) => (
                            <button
                              key={preset.color}
                              className={`w-6 h-6 rounded-full border-2 ${preset.border} ${selectedRegion.fill === preset.color ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
                              style={{ backgroundColor: preset.color }}
                              onClick={() => onBatchRegionChange(selectedIds, { fill: preset.color })}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Stroke Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] text-slate-500">描边效果</label>
                        <button
                          className={`w-9 h-5 rounded-full transition-colors relative ${selectedRegion.strokeWidth ? "bg-indigo-500" : "bg-slate-200"}`}
                          onClick={() => {
                            if (selectedRegion.strokeWidth) {
                              onBatchRegionChange(selectedIds, { strokeWidth: undefined, strokeColor: undefined });
                            } else {
                              onBatchRegionChange(selectedIds, { strokeWidth: 2, strokeColor: "#FFFFFF" });
                            }
                          }}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${selectedRegion.strokeWidth ? "left-4" : "left-0.5"}`} />
                        </button>
                      </div>
                      {selectedRegion.strokeWidth && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedRegion.strokeColor || "#FFFFFF"}
                              onChange={(e) => onBatchRegionChange(selectedIds, { strokeColor: e.target.value })}
                              className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer"
                            />
                            <span className="text-[10px] text-slate-500">描边色</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={selectedRegion.strokeWidth || 2}
                              onChange={(e) => onBatchRegionChange(selectedIds, { strokeWidth: parseInt(e.target.value, 10) || 2 })}
                              className="w-14 p-1.5 text-xs border border-slate-200 rounded-lg text-center"
                            />
                            <span className="text-[10px] text-slate-500">粗细 px</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Direction */}
                    <div>
                      <label className="text-[10px] text-slate-500 mb-2 block">文本方向</label>
                      <div className="flex gap-2">
                        <button
                          className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                            selectedRegion.direction !== "vertical" ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                          onClick={() => onBatchRegionChange(selectedIds, { direction: "horizontal" })}
                        >
                          <MoveHorizontal className="w-3 h-3" />
                          横排
                        </button>
                        <button
                          className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                            selectedRegion.direction === "vertical" ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                          onClick={() => onBatchRegionChange(selectedIds, { direction: "vertical" })}
                        >
                          <MoveVertical className="w-3 h-3" />
                          竖排
                        </button>
                      </div>
                    </div>

                    {/* Advanced Typography */}
                    <div>
                      <label className="text-[10px] text-slate-500 mb-2 block">高级排版</label>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-500 w-8">行距</span>
                          <input
                            type="range"
                            min="0.8"
                            max="2.5"
                            step="0.1"
                            value={selectedRegion.lineHeight || 1.0}
                            onChange={(e) => onBatchRegionChange(selectedIds, { lineHeight: parseFloat(e.target.value) })}
                            className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                          <span className="text-[10px] text-slate-600 w-8 text-right">{(selectedRegion.lineHeight || 1.0).toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-500 w-8">字距</span>
                          <input
                            type="range"
                            min="-5"
                            max="20"
                            step="0.5"
                            value={selectedRegion.letterSpacing || 0}
                            onChange={(e) => onBatchRegionChange(selectedIds, { letterSpacing: parseFloat(e.target.value) })}
                            className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                          <span className="text-[10px] text-slate-600 w-8 text-right">{(selectedRegion.letterSpacing || 0).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {allRegions.map((region) => {
                  const isSelected = selectedRegion?.id === region.id || selectedIds.includes(region.id);
                  return (
                    <div
                      key={region.id}
                      ref={isSelected ? selectedRegionRef : null}
                      className={`rounded-xl p-3 cursor-pointer transition-all ${
                        isSelected
                          ? "border-2 border-indigo-500 bg-indigo-50/50 shadow-md"
                          : "border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                      }`}
                      onClick={() => onRegionSelect(region.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className={`text-xs font-bold ${isSelected ? "text-indigo-700" : "text-slate-700"}`}>
                          文本框 {region.regionIndex + 1}
                        </span>
                        {isSelected && (
                          <div className="flex gap-1">
                            <button
                              className="p-1 hover:bg-indigo-100 rounded text-indigo-600"
                              title="样式设置"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Settings className="w-3 h-3" />
                            </button>
                            <button
                              className="p-1 hover:bg-red-50 text-red-500 rounded"
                              title="删除文本框"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const ok = await confirm({ title: "确认删除", message: "确定要删除这个文本框吗？", variant: "danger", confirmLabel: "删除" });
                                if (ok) onRegionDelete(region.id);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="bg-slate-100 p-2 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-500">原文</span>
                            {isSelected && onReOcr && (
                              <button
                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onReOcr(region.id);
                                }}
                                title="重新识别"
                              >
                                <ScanText className="w-3 h-3" />
                                重新识别
                              </button>
                            )}
                          </div>
                          <textarea
                            className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded resize-none focus:border-indigo-400 outline-none"
                            value={region.textOriginal || ""}
                            onChange={(e) => {
                              e.stopPropagation();
                              onRegionChange(region.id, { textOriginal: e.target.value });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="原文内容"
                            rows={2}
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-500">译文</span>
                            {isSelected && onRetranslate && (
                              <button
                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRetranslate(region.id, region.textOriginal || "");
                                }}
                                title="重新翻译"
                              >
                                <RefreshCw className="w-3 h-3" />
                                重新翻译
                              </button>
                            )}
                          </div>
                          <textarea
                            className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white resize-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                            value={region.text}
                            onChange={(e) => {
                              e.stopPropagation();
                              onRegionChange(region.id, { text: e.target.value });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="译文内容"
                            rows={2}
                          />
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-indigo-200 space-y-4">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700">样式设置</label>
                            <button
                              className="text-[10px] text-indigo-600 hover:text-indigo-700 font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRegionChange(region.id, {
                                  fontSize: 16,
                                  fontFamily: defaultFontValue,
                                  fontStyle: undefined,
                                  textDecoration: undefined,
                                  fill: "#000000",
                                  align: "left",
                                  lineHeight: undefined,
                                  letterSpacing: undefined,
                                  direction: "horizontal",
                                });
                              }}
                            >重置样式</button>
                          </div>

                          {/* Text Formatting Toolbar */}
                          <TextFormattingToolbar region={region} onRegionChange={onRegionChange} />

                          {/* Font & Size Row */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <label className="text-[10px] text-slate-500 mb-1 block">字体</label>
                              <CustomSelect
                                options={fontOptions}
                                value={fontOptions.some((o) => o.value === (region.fontFamily || defaultFontValue)) ? (region.fontFamily || defaultFontValue) : defaultFontValue}
                                onChange={(v) => onRegionChange(region.id, { fontFamily: v })}
                                size="sm"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 mb-1 block">字号</label>
                              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white hover:border-slate-300 focus-within:border-indigo-500 transition-colors">
                                <button
                                  type="button"
                                  className="w-7 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-r border-slate-200"
                                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = Math.max(1, (region.fontSize || 16) - 1);
                                    commitFontSize(String(next));
                                  }}
                                >-</button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  className="flex-1 p-1 text-xs text-center outline-none w-full min-w-0"
                                  value={fontSizeDraft}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => { e.stopPropagation(); setFontSizeDraft(e.target.value); }}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Enter") { e.preventDefault(); commitFontSize(fontSizeDraft); }
                                    if (e.key === "Escape") { e.preventDefault(); setFontSizeDraft(String(region.fontSize || 16)); }
                                  }}
                                  onBlur={() => commitFontSize(fontSizeDraft)}
                                />
                                <button
                                  type="button"
                                  className="w-7 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 border-l border-slate-200"
                                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = (region.fontSize || 16) + 1;
                                    commitFontSize(String(next));
                                  }}
                                >+</button>
                              </div>
                            </div>
                          </div>

                          {/* Color Section */}
                          <div>
                            <label className="text-[10px] text-slate-500 mb-2 block">文字颜色</label>
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <input
                                  type="color"
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  value={region.fill || "#000000"}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => onRegionChange(region.id, { fill: e.target.value })}
                                />
                                <div
                                  className="w-9 h-9 rounded-lg border-2 border-slate-200 shadow-inner cursor-pointer hover:border-slate-300 transition-colors"
                                  style={{ backgroundColor: region.fill || "#000000" }}
                                />
                              </div>
                              <div className="flex-1 flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg">
                                {COLOR_PRESETS.map(({ color, border }) => (
                                  <button
                                    key={color}
                                    type="button"
                                    className={`w-6 h-6 rounded-md border ${border} hover:scale-110 hover:shadow-md transition-all color-preset`}
                                    style={{ backgroundColor: color }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRegionChange(region.id, { fill: color });
                                    }}
                                    title={color}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Stroke Section */}
                          <StrokeSection region={region} onRegionChange={onRegionChange} />

                          {/* Direction Toggle */}
                          <div>
                            <label className="text-[10px] text-slate-500 mb-2 block">文本方向</label>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                              <button
                                type="button"
                                className={`flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all ${
                                  region.direction !== "vertical" ? "bg-white shadow-sm font-medium text-indigo-600" : "text-slate-600 hover:bg-white/50"
                                }`}
                                onClick={(e) => { e.stopPropagation(); onRegionChange(region.id, { direction: "horizontal" }); }}
                                title="横向排版"
                              >
                                <MoveHorizontal className="w-3.5 h-3.5" /> 横排
                              </button>
                              <button
                                type="button"
                                className={`flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all ${
                                  region.direction === "vertical" ? "bg-white shadow-sm font-medium text-indigo-600" : "text-slate-600 hover:bg-white/50"
                                }`}
                                onClick={(e) => { e.stopPropagation(); onRegionChange(region.id, { direction: "vertical" }); }}
                                title="竖向排版"
                              >
                                <MoveVertical className="w-3.5 h-3.5" /> 竖排
                              </button>
                            </div>
                          </div>

                          {/* Advanced Typography */}
                          <div className="space-y-3">
                            <label className="text-[10px] text-slate-500 block">高级排版</label>
                            <div className="flex items-center gap-3">
                              <div className="w-16 flex items-center gap-1 text-slate-500">
                                <Baseline className="w-3 h-3" />
                                <span className="text-[10px]">行距</span>
                              </div>
                              <input
                                type="range"
                                min="0.5"
                                max="3"
                                step="0.1"
                                value={region.lineHeight ?? 1.0}
                                onChange={(e) => onRegionChange(region.id, { lineHeight: parseFloat(e.target.value) })}
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="range-slider flex-1"
                              />
                              <span className="w-8 text-[10px] text-slate-600 font-mono text-right">{region.lineHeight?.toFixed(1) || "1.0"}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-16 flex items-center gap-1 text-slate-500">
                                <Space className="w-3 h-3" />
                                <span className="text-[10px]">字距</span>
                              </div>
                              <input
                                type="range"
                                min="-5"
                                max="20"
                                step="0.5"
                                value={region.letterSpacing ?? 0}
                                onChange={(e) => onRegionChange(region.id, { letterSpacing: parseFloat(e.target.value) })}
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                className="range-slider flex-1"
                              />
                              <span className="w-8 text-[10px] text-slate-600 font-mono text-right">{region.letterSpacing?.toFixed(1) || "0.0"}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
