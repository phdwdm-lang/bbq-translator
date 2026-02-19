export interface TranslationTaskState {
  id: string;
  active: boolean;
  stage: string;
  value: number;
  text: string;
  title: string;
  error: string;
  coverUrl: string;
  successCount: number;
  failedCount: number;
  totalCount: number;
}

export interface TranslationProgressSnapshot {
  tasks: TranslationTaskState[];
  modalTaskId: string;
  modalOpen: boolean;
}

export const TRANSLATION_STAGE_DONE = "完成";
export const TRANSLATION_STAGE_FAILED = "失败";
export const TRANSLATION_STAGE_CANCELED = "已取消";
export const TRANSLATION_STAGE_PREPARE_EDITOR = "准备编辑项目";
export const TRANSLATION_STAGE_SCAN_REGIONS = "扫描文本区域";
export const TRANSLATION_STAGE_PARSE_FILES = "解析文件";
export const TRANSLATION_STAGE_TRANSLATING = "翻译中";

export const TRANSLATION_STAGE_TITLE_DONE = "已完成";
export const TRANSLATION_STAGE_TITLE_FAILED = "失败";
export const TRANSLATION_STAGE_TITLE_CANCELED = "已取消";
export const TRANSLATION_STAGE_TITLE_RUNNING = "正在翻译";
export const TRANSLATION_STAGE_FINISHED = [
  TRANSLATION_STAGE_DONE,
  TRANSLATION_STAGE_FAILED,
  TRANSLATION_STAGE_CANCELED,
] as const;
export type TranslationFinishedStage = (typeof TRANSLATION_STAGE_FINISHED)[number];

export function isTranslationStageFinished(stage: string): stage is TranslationFinishedStage {
  return TRANSLATION_STAGE_FINISHED.includes(stage as TranslationFinishedStage);
}

export function resolveTranslationStageTitle(stage: string): string {
  if (stage === TRANSLATION_STAGE_DONE) return TRANSLATION_STAGE_TITLE_DONE;
  if (stage === TRANSLATION_STAGE_FAILED) return TRANSLATION_STAGE_TITLE_FAILED;
  if (stage === TRANSLATION_STAGE_CANCELED) return TRANSLATION_STAGE_TITLE_CANCELED;
  return TRANSLATION_STAGE_TITLE_RUNNING;
}

const tasks = new Map<string, TranslationTaskState>();
let modalTaskId = "";
let modalOpen = false;

// 缓存快照，避免每次调用都创建新对象导致无限循环
let cachedSnapshot: TranslationProgressSnapshot = {
  tasks: [],
  modalTaskId: "",
  modalOpen: false,
};

// 服务端渲染使用的稳定空快照
const SERVER_SNAPSHOT: TranslationProgressSnapshot = {
  tasks: [],
  modalTaskId: "",
  modalOpen: false,
};

const listeners = new Set<() => void>();

function updateSnapshot() {
  cachedSnapshot = {
    tasks: Array.from(tasks.values()),
    modalTaskId,
    modalOpen,
  };
}

function emit() {
  updateSnapshot();
  for (const fn of listeners) fn();
}

export function getTranslationProgress(): TranslationProgressSnapshot {
  return cachedSnapshot;
}

export function getServerSnapshot(): TranslationProgressSnapshot {
  return SERVER_SNAPSHOT;
}

export function getTaskById(taskId: string): TranslationTaskState | undefined {
  return tasks.get(taskId);
}

export function subscribeTranslationProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startTranslation(taskId: string, title: string, params?: { coverUrl?: string; totalCount?: number }) {
  tasks.set(taskId, {
    id: taskId,
    active: true,
    stage: "",
    value: 0,
    text: "",
    title,
    error: "",
    coverUrl: params?.coverUrl || "",
    successCount: 0,
    failedCount: 0,
    totalCount: params?.totalCount || 0,
  });
  modalTaskId = taskId;
  modalOpen = true;
  emit();
}

export function updateTranslationProgress(taskId: string, patch: Partial<Pick<TranslationTaskState, "stage" | "value" | "text" | "error" | "successCount" | "failedCount" | "totalCount">>) {
  const task = tasks.get(taskId);
  if (!task) return;
  tasks.set(taskId, { ...task, ...patch });
  emit();
}

export function finishTranslation(taskId: string, stage: TranslationFinishedStage, extra?: { error?: string }) {
  const task = tasks.get(taskId);
  if (!task) return;
  tasks.set(taskId, {
    ...task,
    active: false,
    stage,
    value: stage === TRANSLATION_STAGE_DONE ? 100 : task.value,
    error: extra?.error || task.error,
  });
  emit();
}

export function closeAndCleanupTask(taskId: string) {
  tasks.delete(taskId);
  modalOpen = false;
  emit();
}

export function setTranslationModalOpen(open: boolean) {
  modalOpen = open;
  emit();
}
