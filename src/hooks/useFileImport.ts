import { useState, useRef } from "react";

type ImportStatus = "idle" | "running" | "done" | "error";

export function useFileImport() {
  const [files, setFiles] = useState<File[]>([]);
  const [importName, setImportName] = useState<string>("");
  const [regionsCount, setRegionsCount] = useState(0);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [error, setError] = useState<string>("");
  const [detectedLang, setDetectedLang] = useState<string>("");
  const [usedOcr, setUsedOcr] = useState<string>("");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resetImport = () => {
    setFiles([]);
    setImportName("");
    setRegionsCount(0);
    setStatus("idle");
    setError("");
    setDetectedLang("");
    setUsedOcr("");
    abortRef.current = null;
  };

  const abortImport = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  return {
    files,
    setFiles,
    importName,
    setImportName,
    regionsCount,
    setRegionsCount,
    status,
    setStatus,
    error,
    setError,
    detectedLang,
    setDetectedLang,
    usedOcr,
    setUsedOcr,
    inputRef,
    abortRef,
    resetImport,
    abortImport,
  };
}

export type FileImportState = ReturnType<typeof useFileImport>;
