import { useEffect } from "react";

import {
  TITLE_BAR_OVERLAY_HEIGHT,
  TITLE_BAR_OVERLAY_TRANSPARENT,
  TITLE_BAR_SYMBOL_COLOR_DEFAULT,
} from "../constants/window";

type TitleBarOverlayOptions = {
  active?: boolean;
  color?: string;
  symbolColor?: string;
  height?: number;
  resetColor?: string;
  resetSymbolColor?: string;
  resetHeight?: number;
};

export function useTitleBarOverlay({
  active = true,
  color = TITLE_BAR_OVERLAY_TRANSPARENT,
  symbolColor = TITLE_BAR_SYMBOL_COLOR_DEFAULT,
  height = TITLE_BAR_OVERLAY_HEIGHT,
  resetColor = TITLE_BAR_OVERLAY_TRANSPARENT,
  resetSymbolColor = TITLE_BAR_SYMBOL_COLOR_DEFAULT,
  resetHeight = TITLE_BAR_OVERLAY_HEIGHT,
}: TitleBarOverlayOptions): void {
  useEffect(() => {
    if (!active) return;
    const mts = window.mts;
    if (!mts) return;
    void mts.setTitleBarOverlay(color, symbolColor, height);
    return () => {
      void mts.setTitleBarOverlay(resetColor, resetSymbolColor, resetHeight);
    };
  }, [active, color, symbolColor, height, resetColor, resetSymbolColor, resetHeight]);
}
