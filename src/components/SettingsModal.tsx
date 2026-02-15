"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { X, Puzzle, UserCircle, Settings as SettingsIcon, Keyboard, Info, Type } from "lucide-react";

import { AccountTab } from "./settings/AccountTab";
import { GeneralTab } from "./settings/GeneralTab";
import { FontsTab } from "./settings/FontsTab";
import { ExtensionsTab } from "./settings/ExtensionsTab";

type TabKey = "account" | "general" | "shortcuts" | "extensions" | "fonts" | "about";

interface TabItem {
  key: TabKey;
  label: string;
  icon: ReactNode;
}

const TAB_ITEMS: TabItem[] = [
  { key: "account", label: "账号", icon: <UserCircle className="h-4 w-4" aria-hidden="true" /> },
  { key: "general", label: "通用", icon: <SettingsIcon className="h-4 w-4" aria-hidden="true" /> },
  { key: "shortcuts", label: "快捷键", icon: <Keyboard className="h-4 w-4" aria-hidden="true" /> },
  { key: "extensions", label: "拓展", icon: <Puzzle className="h-4 w-4" aria-hidden="true" /> },
  { key: "fonts", label: "字体", icon: <Type className="h-4 w-4" aria-hidden="true" /> },
  { key: "about", label: "关于", icon: <Info className="h-4 w-4" aria-hidden="true" /> },
];

export function SettingsModal(props: { open: boolean; onClose: () => void; initialTab?: TabKey; focusExtensionId?: string }) {
  const { open, onClose } = props;
  const [activeTab, setActiveTab] = useState<TabKey>("extensions");

  useEffect(() => {
    if (!open) return;
    if (props.initialTab) setActiveTab(props.initialTab);
  }, [open, props.initialTab]);

  const tabContent = useMemo(() => {
    const isTabOpen = open && activeTab;
    switch (activeTab) {
      case "account":
        return <AccountTab open={!!isTabOpen} />;
      case "general":
        return <GeneralTab />;
      case "fonts":
        return <FontsTab open={open && activeTab === "fonts"} />;
      case "extensions":
        return <ExtensionsTab open={open && activeTab === "extensions"} focusExtensionId={props.focusExtensionId} />;
      default:
        return <div className="text-xs font-black text-black/60">该功能暂未开放</div>;
    }
  }, [activeTab, open, props.focusExtensionId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 pt-12">
      <div className="bg-white w-full max-w-[900px] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">设置</h2>
          <button type="button" className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="关闭">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] min-h-[480px]">
          <nav className="bg-slate-50 border-r border-slate-100 p-3 space-y-1">
            {TAB_ITEMS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-xs font-bold rounded-lg transition-colors ${
                  activeTab === t.key
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {tabContent}
          </div>
        </div>
      </div>
    </div>
  );
}
