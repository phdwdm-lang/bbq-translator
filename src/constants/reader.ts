export const READER_VIEW_MODES = [
  { id: "scroll", label: "滚动模式", icon: "Scroll" },
  { id: "single", label: "单页模式", icon: "File" },
  { id: "double", label: "双页模式", icon: "Columns2" },
] as const;

export type ReaderViewMode = (typeof READER_VIEW_MODES)[number]["id"];

export const DEFAULT_VIEW_MODE: ReaderViewMode = "single";

export const ZOOM_STEP = 0.1;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3.0;
export const ZOOM_DEFAULT = 1.0;
