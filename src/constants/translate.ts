export interface SelectOption {
  value: string;
  label: string;
}

export const OCR_OPTIONS: SelectOption[] = [
  { value: "auto", label: "Auto" },
  { value: "mocr", label: "MangaOCR (mocr)" },
  { value: "48px_ctc", label: "48px_ctc" },
  { value: "48px", label: "48px" },
  { value: "32px", label: "32px" },
];

export const VALID_TRANSLATORS = [
  "youdao",
  "baidu",
  "deepl",
  "papago",
  "caiyun",
  "sakura",
  "offline",
  "openai",
  "deepseek",
  "groq",
  "gemini",
  "custom_openai",
  "nllb",
  "nllb_big",
  "sugoi",
  "jparacrawl",
  "jparacrawl_big",
  "m2m100",
  "m2m100_big",
  "mbart50",
  "qwen2",
  "qwen2_big",
  "none",
  "original",
] as const;

export type TranslatorId = (typeof VALID_TRANSLATORS)[number];
