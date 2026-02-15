import { isFileBlobKey, putBlob, getBlob } from "./blobDb";
import { loadLibrary, saveLibrary, type MangaBook, type MangaPage } from "./storage";

const MIGRATION_FLAG = "mit.blobs_fs_migrated.v1";

export function isBlobFsMigrationNeeded(): boolean {
  if (typeof window === "undefined" || !window.mts) return false;
  try {
    return !window.localStorage.getItem(MIGRATION_FLAG);
  } catch {
    return false;
  }
}

export async function migrateBlobsToFileSystem(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const books = loadLibrary();

  const entries: Array<{
    bookId: string;
    chapterId: string;
    pageId: string;
    field: keyof Pick<MangaPage, "originalBlobKey" | "translatedBlobKey" | "renderedBlobKey">;
    oldKey: string;
    name?: string;
  }> = [];

  for (const book of books) {
    if (book.coverBlobKey && !isFileBlobKey(book.coverBlobKey)) {
      entries.push({
        bookId: book.id,
        chapterId: "_covers",
        pageId: "",
        field: "originalBlobKey",
        oldKey: book.coverBlobKey,
        name: "cover",
      });
    }

    for (const chapter of book.chapters) {
      if (chapter.coverBlobKey && !isFileBlobKey(chapter.coverBlobKey)) {
        entries.push({
          bookId: book.id,
          chapterId: chapter.id,
          pageId: "",
          field: "originalBlobKey",
          oldKey: chapter.coverBlobKey,
          name: "chapter_cover",
        });
      }

      for (const page of chapter.pages) {
        const blobFields = ["originalBlobKey", "translatedBlobKey", "renderedBlobKey"] as const;
        for (const field of blobFields) {
          const key = page[field];
          if (key && !isFileBlobKey(key)) {
            entries.push({
              bookId: book.id,
              chapterId: chapter.id,
              pageId: page.id,
              field,
              oldKey: key,
              name: field === "originalBlobKey" ? page.fileName : undefined,
            });
          }
        }
      }
    }
  }

  if (entries.length === 0) {
    markDone();
    return 0;
  }

  let migrated = 0;
  const keyMap = new Map<string, string>();

  for (const entry of entries) {
    if (keyMap.has(entry.oldKey)) {
      migrated++;
      onProgress?.(migrated, entries.length);
      continue;
    }

    try {
      const blob = await getBlob(entry.oldKey);
      if (!blob) {
        migrated++;
        onProgress?.(migrated, entries.length);
        continue;
      }

      const dir = entry.chapterId === "_covers"
        ? `${entry.bookId}/_covers`
        : `${entry.bookId}/${entry.chapterId}`;

      const newKey = await putBlob(blob, { dir, name: entry.name });
      keyMap.set(entry.oldKey, newKey);
    } catch (err) {
      console.warn("[migrate] failed to migrate blob:", entry.oldKey, err);
    }

    migrated++;
    onProgress?.(migrated, entries.length);
  }

  if (keyMap.size > 0) {
    const updatedBooks = replaceKeysInLibrary(books, keyMap);
    saveLibrary(updatedBooks);
  }

  markDone();
  return keyMap.size;
}

function replaceKeysInLibrary(books: MangaBook[], keyMap: Map<string, string>): MangaBook[] {
  const remap = (key: string | undefined) => {
    if (!key) return key;
    return keyMap.get(key) ?? key;
  };

  return books.map((book) => ({
    ...book,
    coverBlobKey: remap(book.coverBlobKey),
    chapters: book.chapters.map((ch) => ({
      ...ch,
      coverBlobKey: remap(ch.coverBlobKey),
      pages: ch.pages.map((p) => ({
        ...p,
        originalBlobKey: remap(p.originalBlobKey) ?? p.originalBlobKey,
        translatedBlobKey: remap(p.translatedBlobKey),
        renderedBlobKey: remap(p.renderedBlobKey),
      })),
    })),
  }));
}

function markDone() {
  try {
    window.localStorage.setItem(MIGRATION_FLAG, String(Date.now()));
  } catch { /* ignore */ }
}
