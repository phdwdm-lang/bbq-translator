/**
 * 编辑器相关类型定义
 * 统一 EditorRegion 等类型，避免多处重复定义
 */

export type EditorTool = "select" | "ocr_region" | "inpaint_region";

export interface DrawingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorRegion {
  id: string;
  regionIndex: number;
  box: [number, number, number, number];
  text: string;
  textOriginal?: string;
  fontSize?: number;
  fill?: string;
  fontFamily?: string;
  fontStyle?: string;
  textDecoration?: string;
  align?: string;
  lineHeight?: number;
  letterSpacing?: number;
  direction?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export type EditorRegionPatch = Partial<Omit<EditorRegion, "id">>;
