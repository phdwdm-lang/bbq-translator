import { useSyncExternalStore } from "react";
import {
  getTranslationProgress,
  getServerSnapshot,
  subscribeTranslationProgress,
  type TranslationProgressSnapshot,
} from "../lib/translationProgress";

export function useTranslationProgress(): TranslationProgressSnapshot {
  return useSyncExternalStore(
    subscribeTranslationProgress,
    getTranslationProgress,
    getServerSnapshot
  );
}
