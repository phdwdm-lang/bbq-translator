export interface LanguageOption {
  value: string;
  label: string;
}

export const STORAGE_KEY_DEFAULT_LANG = "mts_default_target_lang";
export const STORAGE_KEY_LAST_LANG = "mts_last_target_lang";
export const DEFAULT_INITIAL_LANG = "CHS";

export const SOURCE_LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "自动检测" },
  { value: "JPN", label: "日本語" },
  { value: "ENG", label: "English" },
  { value: "KOR", label: "한국어" },
];

export const TARGET_LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "CHS", label: "简体中文" },
  { value: "CHT", label: "繁體中文" },
  { value: "CSY", label: "čeština" },
  { value: "NLD", label: "Nederlands" },
  { value: "ENG", label: "English" },
  { value: "FRA", label: "français" },
  { value: "DEU", label: "Deutsch" },
  { value: "HUN", label: "magyar nyelv" },
  { value: "ITA", label: "italiano" },
  { value: "JPN", label: "日本語" },
  { value: "KOR", label: "한국어" },
  { value: "POL", label: "polski" },
  { value: "PTB", label: "português" },
  { value: "ROM", label: "limba română" },
  { value: "RUS", label: "русский язык" },
  { value: "ESP", label: "español" },
  { value: "TRK", label: "Türk dili" },
  { value: "UKR", label: "українська мова" },
  { value: "VIN", label: "Tiếng Việt" },
  { value: "ARA", label: "العربية" },
  { value: "CNR", label: "crnogorski jezik" },
  { value: "SRP", label: "српски језик" },
  { value: "HRV", label: "hrvatski jezik" },
  { value: "THA", label: "ภาษาไทย" },
  { value: "IND", label: "Indonesia" },
  { value: "FIL", label: "Wikang Filipino" },
];
