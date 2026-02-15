import { ReactNode } from "react";

interface EditorLayoutProps {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
  header: ReactNode;
}

export function EditorLayout({ left, middle, right, header }: EditorLayoutProps) {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100">
      <div className="h-14 flex-none border-b border-slate-200 bg-white z-20">
        {header}
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-28 flex-none border-r border-slate-200 bg-slate-50 flex flex-col z-10 shrink-0">
          {left}
        </div>
        <div className="flex-1 relative bg-[#e5e5e5] overflow-hidden">
          {middle}
        </div>
        <div className="w-80 flex-none border-l border-slate-200 bg-white flex flex-col z-10 shrink-0 overflow-hidden">
          {right}
        </div>
      </div>
    </div>
  );
}
