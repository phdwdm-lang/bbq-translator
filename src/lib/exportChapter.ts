import { extractBlobDir } from "./blobDb";
import type { MangaPage } from "./storage";

export async function openChapterFolder(
  bookId: string,
  chapterId: string,
  pages: MangaPage[],
): Promise<void> {
  const mts = window.mts;
  if (!mts) return;

  const dir = `${bookId}/${chapterId}`;

  const firstBlobKey = pages.find((p) => p.originalBlobKey)?.originalBlobKey;
  const resolvedDir = firstBlobKey ? extractBlobDir(firstBlobKey) ?? dir : dir;

  const result = await mts.resolveBlobDir(resolvedDir);
  if (result.ok && result.path) {
    await mts.openPath(result.path);
  }
}
