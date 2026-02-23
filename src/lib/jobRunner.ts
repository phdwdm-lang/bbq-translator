import { putBlob } from "./blobDb";
import { resolveImageToBlob, scanMangaImage, isMissingApiKeyError } from "./translateClient";
import {
  addPageToChapter,
  loadJobs,
  setJobItem,
  setJobProgress,
  setJobStatus,
  updateJob,
  type BatchJob,
} from "./storage";

type RunnerState = {
  runningJobIds: Set<string>;
  aborters: Map<string, AbortController>;
};

function getState(): RunnerState {
  const w = window as unknown as { __mitRunner?: RunnerState };
  if (!w.__mitRunner) {
    w.__mitRunner = {
      runningJobIds: new Set<string>(),
      aborters: new Map<string, AbortController>(),
    };
  }
  return w.__mitRunner;
}

function getJob(jobId: string): BatchJob | null {
  const jobs = loadJobs();
  return jobs.find((j) => j.id === jobId) ?? null;
}

export function isJobRunning(jobId: string) {
  const state = getState();
  return state.runningJobIds.has(jobId);
}

export function cancelJob(jobId: string) {
  const state = getState();
  const aborter = state.aborters.get(jobId);
  aborter?.abort();
  state.aborters.delete(jobId);
  state.runningJobIds.delete(jobId);
  setJobStatus(jobId, "error");
}

export async function runBatchJob(jobId: string, files: File[]) {
  if (typeof window === "undefined") return;

  const state = getState();
  if (state.runningJobIds.has(jobId)) return;

  const aborter = new AbortController();
  state.aborters.set(jobId, aborter);
  state.runningJobIds.add(jobId);

  try {
    setJobStatus(jobId, "running");

    const job = getJob(jobId);
    if (!job) throw new Error("Job not found");

    for (let i = job.completed; i < files.length; i += 1) {
      const f = files[i];
      setJobProgress(jobId, { currentIndex: i, status: "running" });
      setJobItem(jobId, i, { status: "running" });

      const blobDir = `${job.targetBookId}/${job.targetChapterId}`;

      let scan;
      try {
        scan = await scanMangaImage({
          file: f,
          lang: job.lang,
          inpainter: job.inpainter ?? "lama_mpe",
          detector: job.detector,
          detectionSize: job.detectionSize,
          inpaintingSize: job.inpaintingSize,
          translator: job.translator,
          targetLang: job.targetLang ?? "CHS",
          ocr: job.ocr,
          signal: aborter.signal,
        });
      } catch (scanErr: unknown) {
        if (isMissingApiKeyError(scanErr)) {
          const providerLabel = scanErr.provider && scanErr.provider !== "unknown" ? `【${scanErr.provider}】` : "";
          throw new Error(`${providerLabel}API Key 未配置或已失效，请在设置 → 账号中检查 Key 是否正确及余额是否充足`);
        }
        throw scanErr;
      }

      let translatedBlobKey: string | undefined;
      let translatedUrl: string | undefined;

      try {
        const blob = await resolveImageToBlob(scan.translatedImage);
        translatedBlobKey = await putBlob(blob, { dir: blobDir, name: f.name });
      } catch {
        translatedUrl = scan.translatedImage;
      }

      addPageToChapter(job.targetBookId, job.targetChapterId, {
        id: crypto.randomUUID(),
        fileName: f.name,
        createdAt: Date.now(),
        imageSize: scan.imageSize,
        regions: scan.regions,
        originalBlobKey: "",
        translatedBlobKey,
        translatedUrl,
      });

      setJobItem(jobId, i, { status: "success" });
      setJobProgress(jobId, { completed: i + 1 });
    }

    setJobStatus(jobId, "success");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err ?? "Failed");

    updateJob(jobId, (job) => {
      const idx = Math.max(0, Math.min(job.total - 1, job.currentIndex));
      const items = job.items.slice();
      items[idx] = { ...items[idx], status: "error", error: message };
      return { ...job, status: "error", items };
    });
  } finally {
    state.aborters.delete(jobId);
    state.runningJobIds.delete(jobId);
  }
}
