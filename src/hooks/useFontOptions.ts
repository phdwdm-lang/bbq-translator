"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FontOption } from "../constants/editor";
import { DEFAULT_FONT_FAMILY_OPTIONS } from "../constants/editor";
import { getBackendUrl } from "../lib/env";
import type { EditorRegion } from "../types/editor";

function isFontOption(v: unknown): v is FontOption {
  if (!v || typeof v !== "object") return false;
  const obj = v as { value?: unknown; label?: unknown };
  return typeof obj.value === "string" && typeof obj.label === "string";
}

function sanitizeFontOptions(options: FontOption[]): FontOption[] {
  const out: FontOption[] = [];
  const seenLabel = new Set<string>();
  const seenValue = new Set<string>();

  for (const opt of options) {
    const value = opt.value.trim();
    const label = opt.label.trim();
    if (!value || !label) continue;

    const valueLower = value.toLowerCase();
    const labelLower = label.toLowerCase();

    if (valueLower === "monospace" || label.includes("等宽")) continue;

    if (seenValue.has(valueLower) || seenLabel.has(labelLower)) continue;

    seenValue.add(valueLower);
    seenLabel.add(labelLower);
    out.push({ value, label });
  }

  return out;
}

export function useFontOptions(
  allRegions: EditorRegion[],
  onRegionChange: (id: string, patch: Partial<EditorRegion>) => void,
) {
  const [fontOptions, setFontOptions] = useState<FontOption[]>(DEFAULT_FONT_FAMILY_OPTIONS);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const autoFontIdsRef = useRef<Set<string>>(new Set());

  const defaultFontValue = useMemo(() => {
    const hit = fontOptions.find((o) => o.label.includes("Arial Unicode") || o.label.includes("全字符"));
    return hit?.value || "sans-serif";
  }, [fontOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/supported_fonts`);
        const json: unknown = await res.json();
        const fontsUnknown = (json && typeof json === "object" ? (json as { fonts?: unknown }).fonts : undefined) ?? [];
        const fonts = Array.isArray(fontsUnknown) ? fontsUnknown : [];
        const cleaned = fonts.filter(isFontOption).map((f) => ({ value: f.value, label: f.label }));
        const merged = sanitizeFontOptions([...DEFAULT_FONT_FAMILY_OPTIONS, ...cleaned]);
        if (!cancelled && merged.length > 0) setFontOptions(merged);
      } catch {
        if (!cancelled) setFontOptions(sanitizeFontOptions(DEFAULT_FONT_FAMILY_OPTIONS));
      } finally {
        if (!cancelled) setFontsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!fontsLoaded) return;
    if (!defaultFontValue || defaultFontValue === "sans-serif") return;

    const needsUpdate = allRegions.filter((r) => !r.fontFamily && !autoFontIdsRef.current.has(r.id));
    if (needsUpdate.length === 0) return;

    for (const r of needsUpdate) {
      autoFontIdsRef.current.add(r.id);
      onRegionChange(r.id, { fontFamily: defaultFontValue });
    }
  }, [allRegions, defaultFontValue, fontsLoaded, onRegionChange]);

  const ensureRegionFont = (region: EditorRegion | null) => {
    if (!region) return;
    const values = new Set(fontOptions.map((o) => o.value));
    const cur = region.fontFamily || defaultFontValue;
    if (!region.fontFamily) {
      if (!fontsLoaded) return;
      if (cur) {
        autoFontIdsRef.current.add(region.id);
        onRegionChange(region.id, { fontFamily: cur });
      }
      return;
    }
    if (cur && !values.has(cur)) {
      onRegionChange(region.id, { fontFamily: defaultFontValue });
      return;
    }
    if (
      fontsLoaded &&
      defaultFontValue !== "sans-serif" &&
      region.fontFamily === "sans-serif" &&
      autoFontIdsRef.current.has(region.id)
    ) {
      onRegionChange(region.id, { fontFamily: defaultFontValue });
    }
  };

  return { fontOptions, defaultFontValue, fontsLoaded, ensureRegionFont };
}
