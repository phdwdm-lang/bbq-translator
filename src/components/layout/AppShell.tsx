"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Bell, Search } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BackendStatusBar } from "../common/BackendStatusBar";
import { BackendLoadingScreen } from "../common/BackendLoadingScreen";
import { useBackendStatus } from "../../hooks/useBackendStatus";
import { IS_ELECTRON } from "../../lib/env";
import { isMigrationNeeded, migrateBackendResultsToLocal } from "../../lib/migrateBackendResults";
import { isBlobFsMigrationNeeded, migrateBlobsToFileSystem } from "../../lib/migrateBlobsToFs";
import { notifyMitChange } from "../../lib/storage";
import { useDesktopStorageInit } from "../../hooks/useDesktopStorageInit";
import { useSidebarCollapse } from "../../hooks/useSidebarCollapse";
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
  const { collapsed, toggle: toggleSidebar } = useSidebarCollapse();
  const { alert } = useDialog();
  const { status: backendStatus, restart: restartBackend } = useBackendStatus();

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
      <Sidebar onOpenSettings={onOpenSettings} collapsed={collapsed} onToggleCollapse={toggleSidebar} />

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
          </div>
        </header>

        <BackendStatusBar status={backendStatus} restart={restartBackend} />
        {IS_ELECTRON && backendStatus === "starting" && <BackendLoadingScreen />}

        <main id="app-main-scroll" className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
