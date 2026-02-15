"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

type DialogVariant = "danger" | "primary" | "info";

interface DialogConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  mode: "confirm" | "alert" | "prompt";
  defaultValue?: string;
  placeholder?: string;
}

interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface DialogContextValue {
  confirm: (options: Omit<DialogConfig, "mode">) => Promise<boolean>;
  alert: (options: Pick<DialogConfig, "title" | "message" | "confirmLabel" | "variant">) => Promise<void>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}

const VARIANT_STYLES: Record<DialogVariant, string> = {
  danger: "bg-red-600 hover:bg-red-700 shadow-red-200",
  primary: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200",
  info: "bg-slate-600 hover:bg-slate-700 shadow-slate-200",
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DialogConfig | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const promptResolveRef = useRef<((value: string | null) => void) | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const promptInputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (options: Omit<DialogConfig, "mode">): Promise<boolean> =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setConfig({ ...options, mode: "confirm" });
      }),
    [],
  );

  const alert = useCallback(
    (options: Pick<DialogConfig, "title" | "message" | "confirmLabel" | "variant">): Promise<void> =>
      new Promise<void>((resolve) => {
        resolveRef.current = () => resolve();
        setConfig({ ...options, mode: "alert" });
      }),
    [],
  );

  const prompt = useCallback(
    (options: PromptOptions): Promise<string | null> =>
      new Promise((resolve) => {
        promptResolveRef.current = resolve;
        setPromptValue(options.defaultValue || "");
        setConfig({ title: options.title, message: options.message || "", confirmLabel: options.confirmLabel, defaultValue: options.defaultValue, placeholder: options.placeholder, mode: "prompt" });
      }),
    [],
  );

  const handleClose = useCallback((result: boolean) => {
    if (config?.mode === "prompt") {
      promptResolveRef.current?.(result ? promptValue.trim() : null);
      promptResolveRef.current = null;
    } else {
      resolveRef.current?.(result);
      resolveRef.current = null;
    }
    setConfig(null);
  }, [config?.mode, promptValue]);

  useEffect(() => {
    if (config?.mode === "prompt") {
      setTimeout(() => promptInputRef.current?.focus(), 50);
    }
  }, [config?.mode]);

  return (
    <DialogContext.Provider value={{ confirm, alert, prompt }}>
      {children}
      {config && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={() => handleClose(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800">{config.title}</h3>
            {config.message && (
              <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{config.message}</p>
            )}

            {config.mode === "prompt" && (
              <input
                ref={promptInputRef}
                type="text"
                className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
                placeholder={config.placeholder}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleClose(true); }}
              />
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              {(config.mode === "confirm" || config.mode === "prompt") && (
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  onClick={() => handleClose(false)}
                >
                  {config.cancelLabel || "取消"}
                </button>
              )}
              <button
                type="button"
                className={`px-4 py-2 text-white text-sm font-medium rounded-xl shadow-sm transition-colors ${VARIANT_STYLES[config.variant || "primary"]}`}
                onClick={() => handleClose(true)}
                autoFocus
              >
                {config.confirmLabel || "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
