"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import {
  TRANSLATOR_CREDENTIALS,
  type TranslatorCredentialConfig,
  type CredentialField,
} from "../../constants/credentials";
import { verifyApiKey } from "../../lib/translateClient";

const EMPTY_VALUE = "";
const API_KEY_FIELD_KEY = "apiKey";
const API_BASE_FIELD_KEY = "apiBase";
const MODEL_FIELD_KEY = "model";
const PASSWORD_FIELD_TYPE = "password";
const INPUT_TYPE_TEXT = "text";
const VERIFY_STATE_IDLE = "idle";
const VERIFY_STATE_VERIFYING = "verifying";
const VERIFY_STATE_SUCCESS = "success";
const VERIFY_STATE_ERROR = "error";
const VERIFY_MESSAGE_API_KEY_REQUIRED = "请先填写 API Key";
const VERIFY_MESSAGE_FAILED = "验证失败";
const API_KEY_VISIBILITY_LABEL_SHOW = "显示 API Key";
const API_KEY_VISIBILITY_LABEL_HIDE = "隐藏 API Key";
const VISIBILITY_ICON_SIZE = 16;
const INPUT_BASE_CLASSNAME =
  "w-full p-2 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:border-indigo-500";
const INPUT_TOGGLE_PADDING_CLASSNAME = "pr-9";
const INPUT_WITH_TOGGLE_CLASSNAME = `${INPUT_BASE_CLASSNAME} ${INPUT_TOGGLE_PADDING_CLASSNAME}`;
const INPUT_WRAPPER_CLASSNAME = "relative mt-1";
const VISIBILITY_TOGGLE_BUTTON_CLASSNAME =
  "absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600";

type VerifyState =
  | typeof VERIFY_STATE_IDLE
  | typeof VERIFY_STATE_VERIFYING
  | typeof VERIFY_STATE_SUCCESS
  | typeof VERIFY_STATE_ERROR;

type VisibilityMap = Record<string, boolean>;

function isApiKeyField(field: CredentialField): boolean {
  return field.key === API_KEY_FIELD_KEY;
}

function isPasswordField(field: CredentialField): boolean {
  return field.type === PASSWORD_FIELD_TYPE;
}

function shouldRenderVisibilityToggle(field: CredentialField): boolean {
  return isApiKeyField(field) && isPasswordField(field);
}

function resolveFieldInputType(field: CredentialField, isVisible: boolean): CredentialField["type"] {
  if (shouldRenderVisibilityToggle(field) && isVisible) return INPUT_TYPE_TEXT;
  return field.type;
}

function resolveFieldInputClassName(field: CredentialField): string {
  return shouldRenderVisibilityToggle(field) ? INPUT_WITH_TOGGLE_CLASSNAME : INPUT_BASE_CLASSNAME;
}

function resolveVisibilityLabel(isVisible: boolean): string {
  return isVisible ? API_KEY_VISIBILITY_LABEL_HIDE : API_KEY_VISIBILITY_LABEL_SHOW;
}

function resolveFieldValue(values: Record<string, string>, field?: CredentialField): string {
  if (!field) return EMPTY_VALUE;
  return values[field.storageKey] ?? EMPTY_VALUE;
}

function resolveOptionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function findCredentialField(config: TranslatorCredentialConfig, fieldKey: string): CredentialField | undefined {
  return config.fields.find((field) => field.key === fieldKey);
}

function useCredentialValues(open: boolean) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [toast, setToast] = useState(EMPTY_VALUE);

  useEffect(() => {
    if (!open) return;
    const loaded: Record<string, string> = {};
    try {
      for (const config of TRANSLATOR_CREDENTIALS) {
        for (const field of config.fields) {
          loaded[field.storageKey] = String(localStorage.getItem(field.storageKey) || EMPTY_VALUE);
        }
      }
    } catch {
      // localStorage not available
    }
    setValues(loaded);
    setToast(EMPTY_VALUE);
  }, [open]);

  const updateField = useCallback((storageKey: string, value: string) => {
    setValues((prev) => ({ ...prev, [storageKey]: value }));
  }, []);

  const saveGroup = useCallback((config: TranslatorCredentialConfig) => {
    try {
      for (const field of config.fields) {
        localStorage.setItem(field.storageKey, String(values[field.storageKey] || EMPTY_VALUE));
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
        next[field.storageKey] = EMPTY_VALUE;
      }
      return next;
    });
    setToast(`${config.name} 已清除`);
  }, []);

  return { values, toast, updateField, saveGroup, clearGroup };
}

function buildVisibilityMap(config: TranslatorCredentialConfig): VisibilityMap {
  return config.fields.reduce<VisibilityMap>((visibility, field) => {
    if (shouldRenderVisibilityToggle(field)) {
      visibility[field.storageKey] = false;
    }
    return visibility;
  }, {});
}

function useCredentialVisibility(open: boolean, config: TranslatorCredentialConfig) {
  const [visibilityMap, setVisibilityMap] = useState<VisibilityMap>(() => buildVisibilityMap(config));

  useEffect(() => {
    if (!open) return;
    setVisibilityMap(buildVisibilityMap(config));
  }, [open, config]);

  const toggleVisibility = useCallback((storageKey: string) => {
    setVisibilityMap((prev) => ({ ...prev, [storageKey]: !prev[storageKey] }));
  }, []);

  const isVisible = useCallback((storageKey: string) => Boolean(visibilityMap[storageKey]), [visibilityMap]);

  return { isVisible, toggleVisibility };
}

function useCredentialVerification(config: TranslatorCredentialConfig, values: Record<string, string>) {
  const [verifyState, setVerifyState] = useState<VerifyState>(VERIFY_STATE_IDLE);
  const [verifyMessage, setVerifyMessage] = useState(EMPTY_VALUE);

  const handleVerify = useCallback(async () => {
    const apiKeyField = findCredentialField(config, API_KEY_FIELD_KEY);
    const apiBaseField = findCredentialField(config, API_BASE_FIELD_KEY);
    const modelField = findCredentialField(config, MODEL_FIELD_KEY);

    const apiKey = resolveFieldValue(values, apiKeyField);

    if (!apiKey.trim()) {
      setVerifyState(VERIFY_STATE_ERROR);
      setVerifyMessage(VERIFY_MESSAGE_API_KEY_REQUIRED);
      return;
    }

    const apiBase = resolveOptionalValue(resolveFieldValue(values, apiBaseField));
    const model = resolveOptionalValue(resolveFieldValue(values, modelField));

    setVerifyState(VERIFY_STATE_VERIFYING);
    setVerifyMessage(EMPTY_VALUE);

    try {
      const result = await verifyApiKey({
        provider: config.id,
        apiKey,
        apiBase,
        model,
      });
      setVerifyState(result.valid ? VERIFY_STATE_SUCCESS : VERIFY_STATE_ERROR);
      setVerifyMessage(result.message);
    } catch (err) {
      setVerifyState(VERIFY_STATE_ERROR);
      setVerifyMessage(err instanceof Error ? err.message : VERIFY_MESSAGE_FAILED);
    }
  }, [config, values]);

  return { verifyState, verifyMessage, handleVerify };
}

function CredentialCard({
  config,
  values,
  onFieldChange,
  onSave,
  onClear,
  open,
}: {
  config: TranslatorCredentialConfig;
  values: Record<string, string>;
  onFieldChange: (storageKey: string, value: string) => void;
  onSave: () => void;
  onClear: () => void;
  open: boolean;
}) {
  const { verifyState, verifyMessage, handleVerify } = useCredentialVerification(config, values);
  const { isVisible, toggleVisibility } = useCredentialVisibility(open, config);

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
      <div>
        <div className="text-sm font-bold text-slate-800">{config.name}</div>
        <div className="text-xs text-slate-500 mt-1">{config.description}</div>
      </div>

      {config.fields.map((field) => {
        const fieldValue = resolveFieldValue(values, field);
        const fieldVisible = isVisible(field.storageKey);
        const showToggle = shouldRenderVisibilityToggle(field);

        return (
          <label key={field.key} className="block">
            <div className="text-[10px] font-bold text-slate-600">{field.label}</div>
            <div className={INPUT_WRAPPER_CLASSNAME}>
              <input
                type={resolveFieldInputType(field, fieldVisible)}
                className={resolveFieldInputClassName(field)}
                value={fieldValue}
                onChange={(e) => onFieldChange(field.storageKey, e.target.value)}
                placeholder={field.placeholder}
                autoComplete="off"
              />
              {showToggle && (
                <button
                  type="button"
                  className={VISIBILITY_TOGGLE_BUTTON_CLASSNAME}
                  aria-label={resolveVisibilityLabel(fieldVisible)}
                  aria-pressed={fieldVisible}
                  onClick={() => toggleVisibility(field.storageKey)}
                >
                  {fieldVisible ? (
                    <EyeOff size={VISIBILITY_ICON_SIZE} />
                  ) : (
                    <Eye size={VISIBILITY_ICON_SIZE} />
                  )}
                </button>
              )}
            </div>
          </label>
        );
      })}

      {verifyMessage && (
        <div className={`p-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
          verifyState === VERIFY_STATE_SUCCESS ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
        }`}>
          {verifyState === VERIFY_STATE_SUCCESS ? (
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
          disabled={verifyState === VERIFY_STATE_VERIFYING}
        >
          {verifyState === VERIFY_STATE_VERIFYING ? (
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
          open={open}
        />
      ))}
    </div>
  );
}
