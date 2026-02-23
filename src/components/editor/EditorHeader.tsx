import { ArrowLeft, ArrowRight, Download, Save, Loader2, PanelRight } from "lucide-react";
import { IS_ELECTRON } from "../../lib/env";

interface EditorHeaderProps {
  pageIndex: number;
  totalPages: number;
  fileName?: string;
  chapterTitle?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  showOriginal?: boolean;
  saving?: boolean;
  saveProgress?: string;
  onBack: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onToggleOriginal?: () => void;
  onRenderPreview: () => void;
  onDownload: () => void;
  onSave: () => void;
  rightPanelCollapsed?: boolean;
  onToggleRightPanel?: () => void;
}

export function EditorHeader({
  pageIndex,
  totalPages,
  fileName,
  chapterTitle,
  sourceLanguage,
  targetLanguage,
  showOriginal,
  saving,
  saveProgress,
  onBack,
  onPrevPage,
  onNextPage,
  onToggleOriginal,
  onRenderPreview,
  onDownload,
  onSave,
  rightPanelCollapsed,
  onToggleRightPanel,
}: EditorHeaderProps) {
  const hasPrev = pageIndex > 0;
  const hasNext = pageIndex < totalPages - 1;
  const subtitle = [chapterTitle, fileName].filter(Boolean).join(" / ");

  return (
    <header className="h-14 border-b border-slate-200 flex items-center justify-between pl-6 pr-[140px] bg-white shrink-0 z-20 app-drag-region">
      {/* Left: Back + Title */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          title="返回"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            M
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-slate-800 text-sm">翻译编辑器</h1>
            {subtitle && (
              <span className="text-[10px] text-slate-400 truncate block max-w-[260px]">{subtitle}</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-4">
        {/* Language Direction Indicator */}
        {targetLanguage && (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 bg-slate-100 rounded font-medium text-slate-600">
                {sourceLanguage || "自动检测"}
              </span>
              <ArrowRight className="w-4 h-4 text-slate-300" />
              <span className="px-2 py-1 bg-indigo-50 rounded font-medium text-indigo-600">{targetLanguage}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
          </>
        )}

        {/* Page Navigation */}
        {totalPages > 0 && (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrevPage}
                disabled={!hasPrev || saving}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <span className="text-sm font-bold text-slate-800 w-14 text-center">
                {pageIndex + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={onNextPage}
                disabled={!hasNext || saving}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
            <div className="h-6 w-px bg-slate-200" />
          </>
        )}

        {/* Save Progress Indicator */}
        {saving && saveProgress && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {saveProgress}
          </span>
        )}

        {/* Action Buttons */}
        <button
          type="button"
          onClick={onRenderPreview}
          disabled={saving}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          渲染预览
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || totalPages === 0}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <Save className="w-4 h-4" />
          {saving ? "保存中..." : "保存"}
        </button>
        {!IS_ELECTRON && (
          <button
            type="button"
            onClick={onDownload}
            disabled={saving}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> 导出图片
          </button>
        )}
        {onToggleRightPanel && (
          <>
            <div className="h-6 w-px bg-slate-200" />
            <button
              type="button"
              onClick={onToggleRightPanel}
              title={rightPanelCollapsed ? "展开属性面板" : "收起属性面板"}
              className={`p-2 rounded-lg transition-colors border ${
                rightPanelCollapsed
                  ? "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200"
                  : "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
              }`}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
