"use client";

import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { isTranslationStageFinished, TRANSLATION_STAGE_CANCELED } from "../../lib/translationProgress";

interface ProgressModalProps {
  open: boolean;
  title: string;
  taskLabel: string;
  stage: string;
  progressText: string;
  progressValue: number;
  error?: string;
  doneMessage?: string;
  successCount?: number;
  failedCount?: number;
  totalCount?: number;
  onCancel: () => void;
  onClose: () => void;
}

type ResultStatus = "all_success" | "partial_success" | "all_failed";

const RESULT_CONFIG: Record<ResultStatus, { title: string; icon: typeof CheckCircle; iconColor: string; bgColor: string }> = {
  all_success: { title: "全部烤好啦~", icon: CheckCircle, iconColor: "text-green-500", bgColor: "bg-green-50" },
  partial_success: { title: "部分烤焦了", icon: AlertTriangle, iconColor: "text-amber-500", bgColor: "bg-amber-50" },
  all_failed: { title: "糟糕，BBQ了", icon: XCircle, iconColor: "text-red-500", bgColor: "bg-red-50" },
};

export function ProgressModal({
  open,
  title,
  taskLabel,
  stage,
  progressText,
  progressValue,
  error,
  successCount = 0,
  failedCount = 0,
  totalCount = 0,
  onCancel,
  onClose,
}: ProgressModalProps) {
  if (!open) return null;

  const clampedValue = Math.max(0, Math.min(100, progressValue));
  const isFinished = isTranslationStageFinished(stage);
  const showResult = isFinished && totalCount > 0;

  const getResultStatus = (): ResultStatus => {
    if (failedCount === 0 || (successCount > 0 && failedCount === 0)) return "all_success";
    if (successCount > 0 && failedCount > 0) return "partial_success";
    return "all_failed";
  };

  const resultStatus = getResultStatus();
  const resultConfig = RESULT_CONFIG[resultStatus];
  const ResultIcon = resultConfig.icon;

  if (showResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center">
          <div className={`w-16 h-16 mx-auto rounded-full ${resultConfig.bgColor} flex items-center justify-center mb-4`}>
            <ResultIcon className={`w-8 h-8 ${resultConfig.iconColor}`} />
          </div>
          
          <h3 className="text-xl font-bold text-slate-800 mb-2">{resultConfig.title}</h3>
          
          <div className="text-sm text-slate-600 space-y-1 mb-6">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>成功翻译 <span className="font-bold text-green-600">{successCount}</span> 张</span>
            </div>
            {failedCount > 0 && (
              <div className="flex items-center justify-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span>翻译失败 <span className="font-bold text-red-600">{failedCount}</span> 张</span>
              </div>
            )}
          </div>

          {error && stage !== TRANSLATION_STAGE_CANCELED && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 text-left">{error}</div>
          )}

          <button
            type="button"
            className="w-full px-4 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors"
            onClick={onClose}
          >
            知道了
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>

        <div className="mt-4 space-y-1 text-sm text-slate-600">
          <div>任务：{taskLabel || "-"}</div>
          <div>阶段：{stage || "-"}</div>
          <div>进度：{progressText || "-"}</div>
        </div>

        <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${clampedValue}%` }} />
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          {isFinished ? (
            <div className="flex-1" />
          ) : (
            <button type="button" className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors" onClick={onCancel}>
              取消
            </button>
          )}
          <button type="button" className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors" onClick={onClose}>
            {isFinished ? "关闭" : "后台继续"}
          </button>
        </div>
      </div>
    </div>
  );
}
