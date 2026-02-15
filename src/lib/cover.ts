import type { MangaBook, MangaChapter, MangaPage } from "./storage";

export type BookCoverSourceKind = "custom" | "translated" | "uploaded" | "empty";

export type BookCoverSource = {
  kind: BookCoverSourceKind;
  blobKey?: string;
  url?: string;
  text?: string;
};

function chapterTs(ch: MangaChapter): number {
  return (ch.updatedAt || ch.createdAt || 0) as number;
}

function firstPage(ch: MangaChapter): MangaPage | null {
  const pages = (ch.pages || []) as MangaPage[];
  if (pages.length === 0) return null;
  return pages[0] ?? null;
}

export function resolveBookCoverSource(book: MangaBook | null): BookCoverSource {
  if (!book) return { kind: "empty", text: "暂无内容" };

  if (book.coverBlobKey || book.coverUrl) {
    return { kind: "custom", blobKey: book.coverBlobKey, url: book.coverUrl };
  }

  const chapters = (book.chapters || []) as MangaChapter[];
  if (chapters.length === 0) return { kind: "empty", text: "暂无内容" };

  let latestCooked: MangaChapter | null = null;
  let latestRaw: MangaChapter | null = null;

  for (const ch of chapters) {
    const kind = (ch.kind || "raw") as "raw" | "cooked";
    if (kind === "cooked") {
      if (!latestCooked || chapterTs(ch) >= chapterTs(latestCooked)) latestCooked = ch;
      continue;
    }
    if (!latestRaw || chapterTs(ch) >= chapterTs(latestRaw)) latestRaw = ch;
  }

  const cookedTs = latestCooked ? chapterTs(latestCooked) : -1;
  const rawTs = latestRaw ? chapterTs(latestRaw) : -1;

  const pick = cookedTs >= rawTs ? latestCooked : latestRaw;
  if (!pick) return { kind: "empty", text: "暂无内容" };

  const kind = (pick.kind || "raw") as "raw" | "cooked";
  const p = firstPage(pick);
  if (!p) return { kind: "empty", text: "暂无内容" };

  if (kind === "cooked") {
    const blobKey = p.translatedBlobKey || p.originalBlobKey;
    const url = p.translatedUrl;
    return { kind: "translated", blobKey, url };
  }

  return { kind: "uploaded", blobKey: p.originalBlobKey };
}
