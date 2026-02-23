"use client";

import { Loader2 } from "lucide-react";

export function BackendLoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold">B</span>
          </div>
          <Loader2 className="absolute -bottom-1 -right-1 w-6 h-6 text-indigo-500 animate-spin" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-800">
            BBQ Translator
          </h2>
          <p className="text-sm text-slate-500">
            正在导入运行环境，请稍候…
          </p>
          <p className="text-xs text-slate-400 mt-1">
            首次启动可能需要 1-2 分钟
          </p>
        </div>

        <div className="w-48 h-1 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full animate-loading-bar" />
        </div>
      </div>
    </div>
  );
}
