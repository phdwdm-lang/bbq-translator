"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import {
  TRANSLATOR_CREDENTIALS,
  type TranslatorCredentialConfig,
} from "../../constants/credentials";
import { verifyApiKey } from "../../lib/translateClient";

function useCredentialValues(open: boolean) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!open) return;
    const loaded: Record<string, string> = {};
    try {
      for (const config of TRANSLATOR_CREDENTIALS) {
        for (const field of config.fields) {
          loaded[field.storageKey] = String(localStorage.getItem(field.storageKey) || "");
        }
      }
    } catch {
      // localStorage not available
    }
    setValues(loaded);
    setToast("");
  }, [open]);

  const updateField = useCallback((storageKey: string, value: string) => {
    setValues((prev) => ({ ...prev, [storageKey]: value }));
  }, []);

  const saveGroup = useCallback((config: TranslatorCredentialConfig) => {
    try {
      for (const field of config.fields) {
        localStorage.setItem(field.storageKey, String(values[field.storageKey] || ""));
      }
      setToast(`${config.name} 已保存`);
    } catch {
      setToast("保存失败");
    }
  }, [values]);

  const clearGroup = useCallback((config: TranslatorCredentialConfig) => {
    try {
      for (const field of config.fields) {
        localStorage.removeItem(field.storageKey);
      }
    } catch {
      // ignore
    }
    setValues((prev) => {
      const next = { ...prev };
      for (const field of config.fields) {
        next[field.storageKey] = "";
      }
      return next;
    });
    setToast(`${config.name} 已清除`);
  }, []);

  return { values, toast, updateField, saveGroup, clearGroup };
}

type VerifyState = "idle" | "verifying" | "success" | "error";

function CredentialCard({
  config,
  values,
  onFieldChange,
  onSave,
  onClear,
}: {
  config: TranslatorCredentialConfig;
  values: Record<string, string>;
  onFieldChange: (storageKey: string, value: string) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyMessage, setVerifyMessage] = useState("");

  const handleVerify = async () => {
    const apiKeyField = config.fields.find((f) => f.key === "apiKey");
    const apiBaseField = config.fields.find((f) => f.key === "apiBase");
    const modelField = config.fields.find((f) => f.key === "model");

    const apiKey = apiKeyField ? values[apiKeyField.storageKey] || "" : "";
    const apiBase = apiBaseField ? values[apiBaseField.storageKey] || "" : undefined;
    const model = modelField ? values[modelField.storageKey] || "" : undefined;

    if (!apiKey.trim()) {
      setVerifyState("error");
      setVerifyMessage("请先填写 API Key");
      return;
    }

    setVerifyState("verifying");
    setVerifyMessage("");

    try {
      const result = await verifyApiKey({
        provider: config.id,
        apiKey,
        apiBase,
        model,
      });
      setVerifyState(result.valid ? "success" : "error");
      setVerifyMessage(result.message);
    } catch (err) {
      setVerifyState("error");
      setVerifyMessage(err instanceof Error ? err.message : "验证失败");
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
      <div>
        <div className="text-sm font-bold text-slate-800">{config.name}</div>
        <div className="text-xs text-slate-500 mt-1">{config.description}</div>
      </div>

      {config.fields.map((field) => (
        <label key={field.key} className="block">
          <div className="text-[10px] font-bold text-slate-600">{field.label}</div>
          <input
            type={field.type}
            className="mt-1 w-full p-2 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-500"
            value={values[field.storageKey] || ""}
            onChange={(e) => onFieldChange(field.storageKey, e.target.value)}
            placeholder={field.placeholder}
            autoComplete="off"
          />
        </label>
      ))}

      {verifyMessage && (
        <div className={`p-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
          verifyState === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
        }`}>
          {verifyState === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          {verifyMessage}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-sm transition-colors"
          onClick={onSave}
        >
          保存
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
          onClick={onClear}
        >
          清除
        </button>
        <button
          type="button"
          className="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          onClick={() => void handleVerify()}
          disabled={verifyState === "verifying"}
        >
          {verifyState === "verifying" ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              验证中
            </>
          ) : (
            "验证"
          )}
        </button>
      </div>
    </div>
  );
}

export function AccountTab({ open }: { open: boolean }) {
  const { values, toast, updateField, saveGroup, clearGroup } = useCredentialValues(open);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-bold text-slate-800">翻译模型账号</div>
        <div className="text-xs text-slate-500 mt-1">仅保存在本地，不会自动上传或同步</div>
      </div>

      {toast && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 font-medium">
          {toast}
        </div>
      )}

      {TRANSLATOR_CREDENTIALS.map((config) => (
        <CredentialCard
          key={config.id}
          config={config}
          values={values}
          onFieldChange={updateField}
          onSave={() => saveGroup(config)}
          onClear={() => clearGroup(config)}
        />
      ))}
    </div>
  );
}
