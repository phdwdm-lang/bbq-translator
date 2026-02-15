"use client";

import Link from "next/link";

export function TopBar(props: { title?: string; right?: React.ReactNode }) {
  return (
    <header className="h-10 app-drag-region flex items-center justify-between pl-4 pr-[140px] bg-white border-b border-slate-200 z-20 relative">
      <div className="flex items-center gap-2">
        <Link href="/" className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">M</div>
          <h1 className="font-semibold text-slate-800 text-sm">{props.title ?? "翻译编辑器"}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">{props.right}</div>
    </header>
  );
}
