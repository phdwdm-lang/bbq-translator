/**
 * 编辑器相关常量
 */

export const DETECTION_RESOLUTION = 1536;
export const INPAINTING_SIZE = 2048;

export const DIRECTION_AUTO = "auto";
export const DIRECTION_VERTICAL = "vertical";
export const DIRECTION_HORIZONTAL = "horizontal";
export const BACKEND_DIRECTION_VERTICAL = "v";
export const BACKEND_DIRECTION_VERTICAL_ALT = "vr";
export const BACKEND_DIRECTION_HORIZONTAL = "h";
export const DIRECTION_VERTICAL_RATIO = 1.35;
export const DIRECTION_VERTICAL_VALUES = [
  DIRECTION_VERTICAL,
  BACKEND_DIRECTION_VERTICAL,
  BACKEND_DIRECTION_VERTICAL_ALT,
] as const;
export const DIRECTION_HORIZONTAL_VALUES = [
  DIRECTION_HORIZONTAL,
  BACKEND_DIRECTION_HORIZONTAL,
] as const;

export const FONT_SIZE_PRESETS = [
  12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 48, 56, 64, 72,
] as const;

export type FontOption = {
  value: string;
  label: string;
};

export const DEFAULT_FONT_FAMILY_OPTIONS: FontOption[] = [
  { value: "sans-serif", label: "无衬线" },
  { value: "Microsoft YaHei", label: "微软雅黑" },
  { value: "SimSun", label: "宋体" },
  { value: "SimHei", label: "黑体" },
];

export const DETECTION_SIZE_OPTIONS = [1024, 1536, 2048, 2560] as const;
export const INPAINTING_SIZE_OPTIONS = [516, 1024, 2048, 2560] as const;
