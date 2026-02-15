import type { TextRegion } from "./storage";
import { API_BASE } from "./env";
import { loadCredentialHeaders } from "../constants/credentials";

export type ScanResult = {
  regions: TextRegion[];
  translatedImage: string;
  cleanImage?: string;
  imageSize?: [number, number];
  detectedLang?: string;
  usedOcr?: string;
  usedDetector?: string;
};

export type RenderPageResult = {
  image: string;
  imageSize?: [number, number];
  renderedCount?: number;
};

export type ProbeLangResult = {
  detectedLang: string;
  probeOcr?: string;
  detector?: string;
  sampleText?: string;
};

export async function probeLang(params: {
  file: File;
  detector?: string;
  detectionSize?: number;
  signal?: AbortSignal;
}): Promise<ProbeLangResult> {
  const formData = new FormData();
  formData.append("file", params.file);
  if (params.detector) formData.append("detector", params.detector);
  if (typeof params.detectionSize === "number") formData.append("detection_size", String(params.detectionSize));

  const res = await fetch(`${API_BASE}/probe_lang`, {
    method: "POST",
    body: formData,
    signal: params.signal,
  });

  const data = await res.json();
  if (!data || data.status !== "success") {
    throw new Error(data?.message || "Probe lang failed");
  }
  return {
    detectedLang: data.detected_lang,
    probeOcr: data.probe_ocr,
    detector: data.detector,
    sampleText: data.sample_text,
  };
}

export async function renderMangaPage(params: {
  file: File;
  regions: TextRegion[];
  targetLang?: string;
  fontPath?: string;
  lineSpacing?: number;
  disableFontBorder?: boolean;
  signal?: AbortSignal;
}): Promise<RenderPageResult> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("regions", JSON.stringify(params.regions ?? []));
  if (params.targetLang) formData.append("target_lang", params.targetLang);
  if (params.fontPath) formData.append("font_path", params.fontPath);
  if (typeof params.lineSpacing === "number") formData.append("line_spacing", String(params.lineSpacing));
  if (params.disableFontBorder) formData.append("disable_font_border", "1");

  const res = await fetch(`${API_BASE}/render_page`, {
    method: "POST",
    body: formData,
    headers: loadCredentialHeaders(),
    signal: params.signal,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  const text = !isJson ? await res.text().catch(() => "") : "";

  if (!res.ok) {
    const detail = data?.message || data?.detail || text || res.statusText;
    throw new Error(`Render page failed (${res.status}): ${detail}`);
  }

  if (!data || data.status !== "success") {
    const detail = data?.message || data?.detail || "unknown";
    throw new Error(`Render page failed: ${detail}`);
  }

  return {
    image: data.image,
    imageSize: data.image_size,
    renderedCount: typeof data.rendered_count === "number" ? data.rendered_count : undefined,
  };
}

export async function scanMangaImage(params: {
  file: File;
  lang: string;
  inpainter?: string;
  detector?: string;
  detectionSize?: number;
  inpaintingSize?: number;
  translator?: string;
  targetLang?: string;
  ocr?: string;
  signal?: AbortSignal;
}): Promise<ScanResult> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("lang", params.lang);
  if (params.inpainter) formData.append("inpainter", params.inpainter);
  if (params.detector) formData.append("detector", params.detector);
  if (typeof params.detectionSize === "number") formData.append("detection_size", String(params.detectionSize));
  if (typeof params.inpaintingSize === "number") formData.append("inpainting_size", String(params.inpaintingSize));
  if (params.translator) formData.append("translator", params.translator);
  if (params.targetLang) formData.append("target_lang", params.targetLang);
  if (params.ocr) formData.append("ocr", params.ocr);

  const res = await fetch(`${API_BASE}/scan`, {
    method: "POST",
    body: formData,
    headers: loadCredentialHeaders(),
    signal: params.signal,
  });

  const data = await res.json();
  if (!data || data.status !== "success") {
    throw new Error(data?.message || "Scan failed");
  }

  return {
    regions: data.regions ?? [],
    translatedImage: data.translated_image,
    cleanImage: data.clean_image || undefined,
    imageSize: data.image_size,
    detectedLang: data.detected_lang,
    usedOcr: data.used_ocr,
    usedDetector: data.used_detector,
  };
}

export async function convertMobiToEpub(params: { file: File; signal?: AbortSignal }): Promise<File> {
  const formData = new FormData();
  formData.append("file", params.file);

  const res = await fetch(`${API_BASE}/convert_mobi_to_epub`, {
    method: "POST",
    body: formData,
    signal: params.signal,
  });

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    throw new Error(data?.message || "MOBI convert failed");
  }
  if (!res.ok) throw new Error("MOBI convert failed");

  const blob = await res.blob();
  const name = params.file.name.replace(/\.mobi$/i, "") + ".epub";
  return new File([blob], name, { type: "application/epub+zip" });
}

export async function convertRarToZip(params: { file: File; signal?: AbortSignal }): Promise<File> {
  const formData = new FormData();
  formData.append("file", params.file);

  const res = await fetch(`${API_BASE}/convert_rar_to_zip`, {
    method: "POST",
    body: formData,
    signal: params.signal,
  });

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    throw new Error(data?.message || "RAR/CBR convert failed");
  }
  if (!res.ok) throw new Error("RAR/CBR convert failed");

  const blob = await res.blob();
  const name = params.file.name.replace(/\.(rar|cbr)$/i, "") + ".zip";
  return new File([blob], name, { type: "application/zip" });
}

export async function resolveImageToBlob(image: string): Promise<Blob> {
  if (!image || typeof image !== "string") {
    throw new Error("Invalid image URL/base64 (empty)");
  }
  if (image.startsWith("data:")) {
    const res = await fetch(image);
    return await res.blob();
  }

  const res = await fetch(image);
  if (!res.ok) throw new Error("Failed to fetch translated image");
  return await res.blob();
}

export type ResultListItem = {
  id: string;
  title: string;
  updated_at: number;
  cover: string;
  count: number;
};

export type ResultPages = {
  task: string;
  title: string;
  updated_at: number;
  count: number;
  files: string[];
};

export async function listResults(params?: { limit?: number; signal?: AbortSignal }): Promise<ResultListItem[]> {
  const requestedLimit = typeof params?.limit === "number" ? params.limit : undefined;
  const qs = typeof requestedLimit === "number" ? `?limit=${encodeURIComponent(String(requestedLimit))}` : "";
  const res = await fetch(`${API_BASE}/results/list${qs}`, { method: "GET", signal: params?.signal });
  const data = await res.json();
  const items = (data?.items ?? []) as ResultListItem[];
  if (typeof requestedLimit === "number") return items.slice(0, requestedLimit);
  return items;
}

export function resultFileUrl(task: string, filename: string): string {
  return `${API_BASE}/results/file/${encodeURIComponent(task)}/${encodeURIComponent(filename)}`;
}

export async function uploadResultImage(params: {
  task: string;
  filename: string;
  blob: Blob;
  displayTitle?: string;
  signal?: AbortSignal;
}): Promise<{ status: string; task: string; filename: string; url: string }> {
  const formData = new FormData();
  formData.append("task", params.task);
  formData.append("filename", params.filename);
  if (params.displayTitle) formData.append("display_title", params.displayTitle);
  formData.append("file", new File([params.blob], params.filename));

  const res = await fetch(`${API_BASE}/results/upload_image`, {
    method: "POST",
    body: formData,
    signal: params.signal,
  });
  const data = await res.json();
  if (!res.ok || data?.status !== "ok") {
    throw new Error(data?.detail || data?.message || "Upload result image failed");
  }
  return data;
}

export async function deleteResultTask(params: { task: string; signal?: AbortSignal }): Promise<{ status: string; task: string }> {
  const res = await fetch(`${API_BASE}/results/task/${encodeURIComponent(params.task)}`, {
    method: "DELETE",
    signal: params.signal,
  });

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Delete result task failed（${res.status}）：${(text || res.statusText || "unknown").trim()}`);
  }

  const data = (await res.json()) as unknown;
  const obj = (data && typeof data === "object" ? (data as Record<string, unknown>) : null) as Record<string, unknown> | null;
  const status = obj ? obj["status"] : undefined;
  if (!res.ok || status !== "ok") {
    const detail = obj ? obj["detail"] : undefined;
    const message = obj ? obj["message"] : undefined;
    const err = typeof detail === "string" ? detail : typeof message === "string" ? message : "Delete result task failed";
    throw new Error(err);
  }

  return {
    status: "ok",
    task: typeof obj?.["task"] === "string" ? (obj!["task"] as string) : params.task,
  };
}

export async function listResultPages(params: { task: string; signal?: AbortSignal }): Promise<ResultPages> {
  const res = await fetch(`${API_BASE}/results/pages/${encodeURIComponent(params.task)}`, {
    method: "GET",
    signal: params.signal,
  });

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`后端接口 /results/pages 不可用（${res.status}）：${(text || res.statusText || "unknown").trim()}`);
  }

  const data = (await res.json()) as unknown;
  const obj = (data && typeof data === "object" ? (data as Record<string, unknown>) : null) as Record<string, unknown> | null;
  const status = obj ? obj["status"] : undefined;

  if (!res.ok || status !== "ok") {
    const detail = obj ? obj["detail"] : undefined;
    const message = obj ? obj["message"] : undefined;
    const err = typeof detail === "string" ? detail : typeof message === "string" ? message : "List result pages failed";
    if (res.status === 404 && err === "Not Found") {
      throw new Error("后端未提供 /results/pages/{task} 接口，请重启后端或确认已更新到最新 api.py");
    }
    throw new Error(err);
  }

  return {
    task: typeof obj?.["task"] === "string" ? (obj!["task"] as string) : params.task,
    title: typeof obj?.["title"] === "string" ? (obj!["title"] as string) : params.task,
    updated_at: typeof obj?.["updated_at"] === "number" ? (obj!["updated_at"] as number) : 0,
    count: typeof obj?.["count"] === "number" ? (obj!["count"] as number) : 0,
    files: Array.isArray(obj?.["files"]) ? ((obj!["files"] as unknown[]).filter((x) => typeof x === "string") as string[]) : [],
  };
}

export type MocrStatus = {
  downloaded: boolean;
  cache_dir: string;
  download_state?: string;
  download_error?: string;
  download_endpoint?: string;
  download_attempts?: Array<{ endpoint?: string; error?: string }>;
};

export type ExtensionItem = {
  id: string;
  name: string;
  description?: string;
  size_bytes?: number;
  installed: boolean;
  install_location?: string;
  download_state?: string;
  download_error?: string;
  download_endpoint?: string;
  download_attempts?: Array<{ endpoint?: string; error?: string }>;
  download_url?: string;
  downloaded_bytes?: number;
  total_bytes?: number;
  speed_bps?: number;
  restart_recommended?: boolean;
  restart_required?: boolean;
  restart_reason?: string;
  phase?: string;
};

export async function listExtensions(params?: { signal?: AbortSignal }): Promise<ExtensionItem[]> {
  const res = await fetch(`${API_BASE}/extensions/list`, { method: "GET", signal: params?.signal });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== "ok") {
    throw new Error(data?.message || data?.detail || "List extensions failed");
  }
  const items = Array.isArray(data.items) ? (data.items as ExtensionItem[]) : [];
  return items.filter((x) => x && typeof x.id === "string");
}

export async function installExtension(params: { id: string; signal?: AbortSignal }): Promise<{ id: string; download_started: boolean }> {
  const formData = new FormData();
  formData.append("id", params.id);
  const res = await fetch(`${API_BASE}/extensions/install`, { method: "POST", body: formData, signal: params.signal });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== "ok") {
    throw new Error(data?.message || data?.detail || "Install extension failed");
  }
  return {
    id: String(data.id || params.id),
    download_started: Boolean(data.download_started),
  };
}

export async function importExtensionZip(params: {
  id: string;
  file: File;
  signal?: AbortSignal;
}): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append("id", params.id);
  formData.append("file", params.file);
  const res = await fetch(`${API_BASE}/extensions/import`, { method: "POST", body: formData, signal: params.signal });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== "ok") {
    throw new Error(data?.message || data?.detail || "Import extension zip failed");
  }
  return { id: String(data.id || params.id) };
}

export async function importExtensionWhl(params: { id: string; files: File[]; signal?: AbortSignal }): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append("id", params.id);
  for (const f of params.files) {
    formData.append("file", f);
  }
  const res = await fetch(`${API_BASE}/extensions/import`, { method: "POST", body: formData, signal: params.signal });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== "ok") {
    throw new Error(data?.message || data?.detail || "Import extension whl failed");
  }
  return { id: String(data.id || params.id) };
}

export async function restartBackend(params?: { signal?: AbortSignal }): Promise<void> {
  try {
    await fetch(`${API_BASE}/restart`, { method: "POST", signal: params?.signal });
  } catch {
    // Server may have already exited before responding
  }
}

export async function uninstallExtension(params: { id: string; signal?: AbortSignal }): Promise<{ id: string }> {
  const formData = new FormData();
  formData.append("id", params.id);
  const res = await fetch(`${API_BASE}/extensions/uninstall`, { method: "POST", body: formData, signal: params.signal });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== "ok") {
    throw new Error(data?.message || data?.detail || "Uninstall extension failed");
  }
  return { id: String(data.id || params.id) };
}

export async function getMocrStatus(params?: { signal?: AbortSignal }): Promise<MocrStatus> {
  const res = await fetch(`${API_BASE}/mocr/status`, { method: "GET", signal: params?.signal });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new Error("Fetch mocr status failed");
  }
  return {
    downloaded: Boolean(data.downloaded),
    cache_dir: String(data.cache_dir || ""),
    download_state: typeof data.download_state === "string" ? data.download_state : undefined,
    download_error: typeof data.download_error === "string" ? data.download_error : undefined,
    download_endpoint: typeof data.download_endpoint === "string" ? data.download_endpoint : undefined,
    download_attempts: Array.isArray(data.download_attempts) ? (data.download_attempts as Array<{ endpoint?: string; error?: string }>) : undefined,
  };
}

export type VerifyApiKeyResult = {
  valid: boolean;
  message: string;
};

export async function verifyApiKey(params: {
  provider: string;
  apiKey: string;
  apiBase?: string;
  model?: string;
  signal?: AbortSignal;
}): Promise<VerifyApiKeyResult> {
  const formData = new FormData();
  formData.append("provider", params.provider);
  formData.append("api_key", params.apiKey);
  if (params.apiBase) formData.append("api_base", params.apiBase);
  if (params.model) formData.append("model", params.model);

  const res = await fetch(`${API_BASE}/verify_api_key`, {
    method: "POST",
    body: formData,
    signal: params.signal,
  });

  const data = await res.json().catch(() => null);
  if (!data) {
    return { valid: false, message: "验证请求失败" };
  }

  return {
    valid: Boolean(data.valid),
    message: String(data.message || (data.valid ? "验证成功" : "验证失败")),
  };
}

export async function importMocrOfflineZip(params: { file: File; signal?: AbortSignal }): Promise<MocrStatus> {
  const formData = new FormData();
  formData.append("file", params.file);

  const res = await fetch(`${API_BASE}/mocr/import`, {
    method: "POST",
    body: formData,
    signal: params.signal,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== "ok") {
    const msg = data?.message || "Import mocr offline zip failed";
    throw new Error(String(msg));
  }

  return {
    downloaded: Boolean(data.downloaded),
    cache_dir: String(data.cache_dir || ""),
  };
}
