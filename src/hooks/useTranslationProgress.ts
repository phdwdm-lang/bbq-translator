import { useCallback, useEffect, useState } from "react";
import {
  getTranslationProgress,
  subscribeTranslationProgress,
  type TranslationProgressSnapshot,
} from "../lib/translationProgress";

export function useTranslationProgress(): TranslationProgressSnapshot {
  const [snapshot, setSnapshot] = useState<TranslationProgressSnapshot>(getTranslationProgress);

  const sync = useCallback(() => {
    setSnapshot(getTranslationProgress());
  }, []);

  useEffect(() => {
    sync();
    return subscribeTranslationProgress(sync);
  }, [sync]);

  return snapshot;
}
