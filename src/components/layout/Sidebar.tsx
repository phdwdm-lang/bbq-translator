"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home as HomeIcon, Library, Settings } from "lucide-react";
import { useDialog } from "../common/DialogProvider";

interface SidebarProps {
  onOpenSettings: () => void;
}

const NAV_ITEMS = [
  { href: "/", label: "工作台", icon: HomeIcon },
  { href: "/shelf", label: "书架", icon: Library },
] as const;

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const pathname = usePathname();
  const { alert } = useDialog();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-4 z-20 shrink-0">
      <div>
        <div className="flex items-center gap-3 px-3 mb-8 mt-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-200">
            B
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-800">BBQ Translator</span>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`sidebar-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${
                  isActive ? "active" : "text-slate-600"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div>
        <nav className="space-y-1 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onOpenSettings}
            className="sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600"
          >
            <Settings className="w-5 h-5" />
            设置
          </button>
          <button
            type="button"
            onClick={() => void alert({ title: "提示", message: "该功能暂未开放" })}
            className="sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600"
          >
            <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-[10px] text-slate-400">
              U
            </div>
            <span>我的账户</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}
