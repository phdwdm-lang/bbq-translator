"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home as HomeIcon, Library, Settings, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useDialog } from "../common/DialogProvider";

interface SidebarProps {
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const NAV_ITEMS = [
  { href: "/", label: "工作台", icon: HomeIcon },
  { href: "/shelf", label: "书架", icon: Library },
] as const;

export function Sidebar({ onOpenSettings, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { alert } = useDialog();

  return (
    <aside className={`${collapsed ? "w-[68px]" : "w-64"} bg-white border-r border-slate-200 flex flex-col justify-between p-3 z-20 shrink-0 transition-all duration-200`}>
      <div>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-3"} mb-8 mt-2`}>
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-200 shrink-0">
            B
          </div>
          {!collapsed && <span className="font-bold text-xl tracking-tight text-slate-800 truncate">BBQ Translator</span>}
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`sidebar-item flex items-center ${collapsed ? "justify-center" : "gap-3 px-3"} py-2.5 rounded-lg text-sm ${
                  isActive ? "active" : "text-slate-600"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && label}
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
            title={collapsed ? "设置" : undefined}
            className={`sidebar-item w-full flex items-center ${collapsed ? "justify-center" : "gap-3 px-3"} py-2.5 rounded-lg text-sm text-slate-600`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            {!collapsed && "设置"}
          </button>
          <button
            type="button"
            onClick={() => void alert({ title: "开发中", message: "账户功能正在开发中，将在后续版本推出" })}
            title={collapsed ? "我的账户" : undefined}
            className={`sidebar-item w-full flex items-center ${collapsed ? "justify-center" : "gap-3 px-3"} py-2.5 rounded-lg text-sm text-slate-600`}
          >
            <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-[10px] text-slate-400 shrink-0">
              U
            </div>
            {!collapsed && <span>我的账户</span>}
          </button>
        </nav>

        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          className="w-full flex items-center justify-center py-2 mt-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
