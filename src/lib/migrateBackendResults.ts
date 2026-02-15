import { addPageToChapter, createChapter, QUICK_BOOK_ID, loadLibrary } from "./storage";
import { putBlob } from "./blobDb";
import { listResults, listResultPages, resultFileUrl, deleteResultTask } from "./translateClient";

const MIGRATION_FLAG_KEY = "mit.backend_results_migrated.v1";

export function isMigrationNeeded(): boolean {
  try {
    return !window.localStorage.getItem(MIGRATION_FLAG_KEY);
  } catch {
    return false;
  }
}

export async function migrateBackendResultsToLocal(onProgress?: (done: number, total: number) => void): Promise<number> {
  let results: Awaited<ReturnType<typeof listResults>>;
  try {
    results = await listResults({ limit: 500 });
  } catch {
    markMigrationDone();
    return 0;
  }

  if (results.length === 0) {
    markMigrationDone();
    return 0;
  }

  const existingTitles = new Set(
    loadLibrary()
      .find((b) => b.id === QUICK_BOOK_ID)
      ?.chapters.map((c) => c.title) ?? [],
  );

  let migrated = 0;

  for (const task of results) {
    if (existingTitles.has(task.title)) {
      migrated++;
      onProgress?.(migrated, results.length);
      continue;
    }

    try {
      const pages = await listResultPages({ task: task.id });
      const chapter = createChapter(QUICK_BOOK_ID, task.title, { kind: "cooked" });

      for (const filename of pages.files) {
        const url = resultFileUrl(task.id, filename);
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const blobKey = await putBlob(blob, { dir: `${QUICK_BOOK_ID}/${chapter.id}`, name: filename });
        addPageToChapter(QUICK_BOOK_ID, chapter.id, {
          id: crypto.randomUUID(),
          fileName: filename,
          createdAt: Date.now(),
          originalBlobKey: blobKey,
          translatedBlobKey: blobKey,
        });
      }

      try {
        await deleteResultTask({ task: task.id });
      } catch {
        // best-effort cleanup
      }
    } catch {
      // skip failed tasks
    }

    migrated++;
    onProgress?.(migrated, results.length);
  }

  markMigrationDone();
  return migrated;
}

function markMigrationDone() {
  try {
    window.localStorage.setItem(MIGRATION_FLAG_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}
