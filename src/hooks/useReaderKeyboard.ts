import { useEffect, useCallback } from "react";

type ReaderKeyboardOptions = {
  enabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
};

export function useReaderKeyboard({
  enabled,
  onPrev,
  onNext,
  onExit,
  onZoomIn,
  onZoomOut,
}: ReaderKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (isInput) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          onPrev();
          break;
        case "ArrowRight":
        case " ":
          e.preventDefault();
          onNext();
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
        case "+":
        case "=":
          e.preventDefault();
          onZoomIn?.();
          break;
        case "-":
          e.preventDefault();
          onZoomOut?.();
          break;
      }
    },
    [enabled, onPrev, onNext, onExit, onZoomIn, onZoomOut]
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);
}
