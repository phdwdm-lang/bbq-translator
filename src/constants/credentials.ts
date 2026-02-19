export interface CredentialField {
  key: string;
  storageKey: string;
  label: string;
  placeholder: string;
  type: "text" | "password";
  headerName?: string;
}

export interface TranslatorCredentialConfig {
  id: string;
  name: string;
  description: string;
  fields: CredentialField[];
}

export const TRANSLATOR_CREDENTIALS: TranslatorCredentialConfig[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "用于 deepseek 翻译服务",
    fields: [
      {
        key: "apiKey",
        storageKey: "mit.account.deepseek.apiKey",
        label: "API Key",
        placeholder: "sk-...",
        type: "password",
        headerName: "x-deepseek-api-key",
      },
      {
        key: "apiBase",
        storageKey: "mit.account.deepseek.apiBase",
        label: "API Base（可选）",
        placeholder: "https://api.deepseek.com",
        type: "text",
        headerName: "x-deepseek-api-base",
      },
      {
        key: "model",
        storageKey: "mit.account.deepseek.model",
        label: "Model（可选）",
        placeholder: "deepseek-chat",
        type: "text",
        headerName: "x-deepseek-model",
      },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "用于 Google Gemini 翻译服务",
    fields: [
      {
        key: "apiKey",
        storageKey: "mit.account.gemini.apiKey",
        label: "API Key",
        placeholder: "AIza...",
        type: "password",
        headerName: "x-gemini-api-key",
      },
      {
        key: "model",
        storageKey: "mit.account.gemini.model",
        label: "Model（可选）",
        placeholder: "gemini-1.5-flash-002",
        type: "text",
      },
    ],
  },
  {
    id: "custom_openai",
    name: "Custom OpenAI / Ollama",
    description: "兼容 OpenAI API 的自定义服务（如 Ollama、vLLM）",
    fields: [
      {
        key: "apiKey",
        storageKey: "mit.account.custom_openai.apiKey",
        label: "API Key（可选）",
        placeholder: "ollama",
        type: "password",
        headerName: "x-custom-openai-api-key",
      },
      {
        key: "apiBase",
        storageKey: "mit.account.custom_openai.apiBase",
        label: "API Base",
        placeholder: "http://localhost:11434/v1",
        type: "text",
        headerName: "x-custom-openai-api-base",
      },
      {
        key: "model",
        storageKey: "mit.account.custom_openai.model",
        label: "Model",
        placeholder: "qwen2.5:7b",
        type: "text",
        headerName: "x-custom-openai-model",
      },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    description: "用于 Groq 翻译服务",
    fields: [
      {
        key: "apiKey",
        storageKey: "mit.account.groq.apiKey",
        label: "API Key",
        placeholder: "gsk_...",
        type: "password",
        headerName: "x-groq-api-key",
      },
      {
        key: "model",
        storageKey: "mit.account.groq.model",
        label: "Model（可选）",
        placeholder: "mixtral-8x7b-32768",
        type: "text",
        headerName: "x-groq-model",
      },
    ],
  },
];

const TRANSLATOR_TO_PROVIDER: Record<string, string> = {
  deepseek: "deepseek",
  gemini: "gemini",
  gemini_2stage: "gemini",
  groq: "groq",
  chatgpt: "deepseek",
  chatgpt_2stage: "deepseek",
  custom_openai: "custom_openai",
};

const NO_KEY_TRANSLATORS = new Set([
  "google", "youdao", "baidu", "deepl", "papago", "caiyun", "none", "original",
]);

export function getProviderForTranslator(translatorId: string): string | null {
  if (NO_KEY_TRANSLATORS.has(translatorId)) return null;
  return TRANSLATOR_TO_PROVIDER[translatorId] ?? null;
}

export function isApiKeyConfigured(translatorId: string): boolean {
  const providerId = getProviderForTranslator(translatorId);
  if (!providerId) return true;

  const config = TRANSLATOR_CREDENTIALS.find((c) => c.id === providerId);
  if (!config) return true;

  const apiKeyField = config.fields.find((f) => f.key === "apiKey");
  if (!apiKeyField) return true;

  try {
    const value = String(localStorage.getItem(apiKeyField.storageKey) || "").trim();
    return value.length > 0;
  } catch {
    return false;
  }
}

export function getProviderDisplayName(translatorId: string): string {
  const providerId = getProviderForTranslator(translatorId);
  if (!providerId) return translatorId;
  const config = TRANSLATOR_CREDENTIALS.find((c) => c.id === providerId);
  return config?.name ?? providerId;
}

export function loadCredentialHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const headers: Record<string, string> = {};
  try {
    for (const config of TRANSLATOR_CREDENTIALS) {
      for (const field of config.fields) {
        if (!field.headerName) continue;
        const value = String(localStorage.getItem(field.storageKey) || "").trim();
        if (value) headers[field.headerName] = value;
      }
    }
  } catch {
    // localStorage not available
  }
  return headers;
}
