import type { EditorRegion } from "../types/editor";
import {
  DIRECTION_AUTO,
  DIRECTION_HORIZONTAL,
  DIRECTION_HORIZONTAL_VALUES,
  DIRECTION_VERTICAL,
  DIRECTION_VERTICAL_RATIO,
  DIRECTION_VERTICAL_VALUES,
} from "../constants/editor";

export function debounce<A extends unknown[]>(fn: (...args: A) => unknown, delay: number): (...args: A) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

export const previewCache = new Map<string, { image: string; content_bbox?: [number, number, number, number] }>();

export function getCacheKey(region: EditorRegion): string {
  return JSON.stringify({
    v: 7,
    text: region.text,
    w: region.box[2],
    h: region.box[3],
    fontSize: region.fontSize,
    fontFamily: region.fontFamily,
    fill: region.fill,
    align: region.align,
    lineHeight: region.lineHeight,
    letterSpacing: region.letterSpacing,
    fontStyle: region.fontStyle,
    textDecoration: region.textDecoration,
    direction: region.direction,
    strokeColor: region.strokeColor,
    strokeWidth: region.strokeWidth,
  });
}

export function normalizeDirection(rawDirection?: string, box?: [number, number, number, number]): string {
  const normalized = String(rawDirection ?? "").trim().toLowerCase();
  if (!normalized || normalized === DIRECTION_AUTO) {
    if (box) {
      const [, , width, height] = box;
      return height > width * DIRECTION_VERTICAL_RATIO ? DIRECTION_VERTICAL : DIRECTION_HORIZONTAL;
    }
    return DIRECTION_HORIZONTAL;
  }
  if (DIRECTION_VERTICAL_VALUES.includes(normalized as (typeof DIRECTION_VERTICAL_VALUES)[number])) {
    return DIRECTION_VERTICAL;
  }
  if (DIRECTION_HORIZONTAL_VALUES.includes(normalized as (typeof DIRECTION_HORIZONTAL_VALUES)[number])) {
    return DIRECTION_HORIZONTAL;
  }
  return DIRECTION_HORIZONTAL;
}

export function getContrastingStrokeColor(fill: string): string {
  let r = 0, g = 0, b = 0;

  if (fill.startsWith("#")) {
    const hex = fill.slice(1);
    if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else if (fill.startsWith("rgb")) {
    const match = fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      r = parseInt(match[1], 10);
      g = parseInt(match[2], 10);
      b = parseInt(match[3], 10);
    }
  }

  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 128 ? "#FFFFFF" : "#000000";
}

export function normalizeCanvasFontFamily(fontFamily?: string): string {
  const fallback = "Microsoft YaHei, 微软雅黑, sans-serif";
  if (!fontFamily) return fallback;

  const v = String(fontFamily).trim();
  const lower = v.toLowerCase();
  const looksLikePath = v.includes(":") || v.includes("\\") || v.includes("/") || /\.(ttf|ttc|otf)$/.test(lower);
  if (looksLikePath) return fallback;
  return v;
}
