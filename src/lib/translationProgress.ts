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

const tasks = new Map<string, TranslationTaskState>();
let modalTaskId = "";
let modalOpen = false;


const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function getTranslationProgress(): TranslationProgressSnapshot {
  return {
    tasks: Array.from(tasks.values()),
    modalTaskId,
    modalOpen,
  };
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

export function finishTranslation(taskId: string, stage: "完成" | "失败" | "已取消", extra?: { error?: string }) {
  const task = tasks.get(taskId);
  if (!task) return;
  tasks.set(taskId, {
    ...task,
    active: false,
    stage,
    value: stage === "完成" ? 100 : task.value,
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
