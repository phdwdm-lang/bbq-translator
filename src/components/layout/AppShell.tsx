"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Bell, Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BackendStatusBar } from "../common/BackendStatusBar";
import { isMigrationNeeded, migrateBackendResultsToLocal } from "../../lib/migrateBackendResults";
import { isBlobFsMigrationNeeded, migrateBlobsToFileSystem } from "../../lib/migrateBlobsToFs";
import { notifyMitChange } from "../../lib/storage";
import { useDesktopStorageInit } from "../../hooks/useDesktopStorageInit";
import { useDialog } from "../common/DialogProvider";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AppShellProps {
  title: string;
  backHref?: string;
  breadcrumbs?: BreadcrumbItem[];
  headerActions?: ReactNode;
  children: ReactNode;
  onOpenSettings: () => void;
}

export function AppShell({ title, backHref, breadcrumbs, headerActions, children, onOpenSettings }: AppShellProps) {
  const storageReady = useDesktopStorageInit();
  const { alert } = useDialog();

  const migrationRan = useRef(false);
  useEffect(() => {
    if (!storageReady) return;
    if (migrationRan.current) return;
    migrationRan.current = true;
    if (isMigrationNeeded()) {
      void migrateBackendResultsToLocal().then((count) => {
        if (count > 0) notifyMitChange();
      });
    }
    if (isBlobFsMigrationNeeded()) {
      void migrateBlobsToFileSystem().then((count) => {
        if (count > 0) {
          console.log(`[migrate] migrated ${count} blobs to file system`);
          notifyMitChange();
        }
      });
    }
  }, [storageReady]);

  if (!storageReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex overflow-hidden bg-slate-50">
      <Sidebar onOpenSettings={onOpenSettings} />

      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        <header className="h-12 app-drag-region border-b border-slate-200/60 bg-white/80 backdrop-blur flex items-center justify-between pl-8 pr-[140px] sticky top-0 z-10">
          <nav className="flex items-center gap-1.5 min-w-0 text-sm">
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <>
                {breadcrumbs.map((crumb, i) => {
                  const isLast = i === breadcrumbs.length - 1;
                  return (
                    <span key={i} className="flex items-center gap-1.5 min-w-0">
                      {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                      {crumb.href && !isLast ? (
                        <Link href={crumb.href} className="text-slate-400 hover:text-indigo-600 transition-colors truncate">
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-800 truncate">{crumb.label}</span>
                      )}
                    </span>
                  );
                })}
              </>
            ) : (
              <span className="font-semibold text-slate-800 truncate">{title}</span>
            )}
          </nav>
          <div className="flex items-center gap-4">
            {headerActions}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索..."
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-lg text-sm w-64 transition-all outline-none"
              />
            </div>
            <button
              type="button"
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors relative"
              onClick={() => alert({ title: "提示", message: "通知功能暂未开放" })}
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
          </div>
        </header>

        <BackendStatusBar />

        <main id="app-main-scroll" className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
