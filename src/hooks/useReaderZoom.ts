import { useState, useCallback } from "react";
import { ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT } from "../constants/reader";

export function useReaderZoom() {
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(ZOOM_DEFAULT);
  }, []);

  const zoomPct = Math.round(zoom * 100);

  return { zoom, zoomPct, zoomIn, zoomOut, resetZoom };
}
