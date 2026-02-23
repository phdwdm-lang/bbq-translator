export async function openChapterFolder(
  bookId: string,
  chapterId: string,
): Promise<void> {
  const mts = window.mts;
  if (!mts) return;

  const result = await mts.resolveBlobDir(`${bookId}/${chapterId}`);
  if (result.ok && result.path) {
    await mts.openPath(result.path);
  }
}
