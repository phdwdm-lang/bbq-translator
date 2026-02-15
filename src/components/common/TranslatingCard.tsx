"use client";

import { Loader2 } from "lucide-react";

interface TranslatingCardProps {
  title: string;
  progressValue: number;
  progressText: string;
  stage: string;
  coverUrl?: string;
}

const STAGE_LABELS: Record<string, string> = {
  "解析文件": "准备食材中",
  "翻译中": "正在烤制中",
  "完成": "出炉啦！",
  "失败": "翻车了…",
  "已取消": "已取消",
};

function resolveStageLabel(stage: string): string {
  return STAGE_LABELS[stage] || stage || "准备中";
}

const CIRCLE_RADIUS = 44;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export function TranslatingCard({ title, progressValue, progressText, stage, coverUrl }: TranslatingCardProps) {
  const label = resolveStageLabel(stage);
  const clampedValue = Math.max(0, Math.min(100, progressValue));
  const strokeDashoffset = CIRCLE_CIRCUMFERENCE * (1 - clampedValue / 100);

  return (
    <div className="group cursor-default">
      <div className="aspect-[3/4] bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Blurred background image */}
        {coverUrl && (
          <>
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-sm scale-110"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-white/30" />
          </>
        )}

        {/* Spinning ring + inner icon */}
        <div className="relative w-24 h-24 mb-4 z-10">
          {/* Static track */}
          <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
          {/* Progress arc */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r={CIRCLE_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={CIRCLE_CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              className="text-indigo-500 transition-all duration-500 ease-out"
            />
          </svg>
          {/* Center percentage */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-indigo-600">{clampedValue}%</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2 z-10">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${clampedValue}%` }}
          />
        </div>

        <span className="text-sm font-bold text-slate-600 z-10">
          {label}…
        </span>
      </div>

      <div className="mt-3">
        <h4 className="font-bold text-slate-800 text-sm truncate">{title || "未命名项目"}</h4>
        <p className="text-xs text-slate-500 mt-1">{progressText}</p>
      </div>
    </div>
  );
}
