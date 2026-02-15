"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus, Pencil, Image as ImageIcon, Trash2, Import } from "lucide-react";
import { AppShell } from "../../components/layout/AppShell";
import { deleteBlob, getBlob, putBlob } from "../../lib/blobDb";
import { resolveBookCoverSource } from "../../lib/cover";
import { deleteBook, ensureQuickBook, getAllBlobKeysFromBook, loadLibrary, subscribeLibrary, setBookCover, QUICK_BOOK_ID, type MangaBook } from "../../lib/storage";
import { SettingsModal } from "../../components/SettingsModal";
import { BookEditModal } from "../../components/common/BookEditModal";
import { useDialog } from "../../components/common/DialogProvider";

export default function ShelfPage() {
  const { confirm, alert } = useDialog();
  const [books, setBooks] = useState<MangaBook[]>(() => {
    if (typeof window === "undefined") return [];
    ensureQuickBook();
    return loadLibrary();
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [bookMenuOpenId, setBookMenuOpenId] = useState<string>("");
  const bookMenuRef = useRef<HTMLDivElement | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBook, setEditingBook] = useState<MangaBook | null>(null);

  const [bookCoverUrls, setBookCoverUrls] = useState<Record<string, string>>({});
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverTargetBookId, setCoverTargetBookId] = useState<string>("");
  useEffect(() => {
    const unsub = subscribeLibrary(() => setBooks(loadLibrary()));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!bookMenuOpenId) return;
    const onDown = (e: MouseEvent) => {
      const el = bookMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setBookMenuOpenId("");
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [bookMenuOpenId]);

  useEffect(() => {
    return () => {
      Object.values(bookCoverUrls).forEach((u) => {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      });
    };
  }, [bookCoverUrls]);

  const quick = useMemo(
    () => books.find((b) => b.id === QUICK_BOOK_ID) ?? { id: QUICK_BOOK_ID, title: "翻译内容", createdAt: 0, chapters: [] },
    [books]
  );
  const userBooks = useMemo(() => books.filter((b) => b.id !== QUICK_BOOK_ID), [books]);

  const userBookCoverSources = useMemo(() => {
    const map: Record<string, ReturnType<typeof resolveBookCoverSource>> = {};
    for (const b of userBooks) map[b.id] = resolveBookCoverSource(b);
    return map;
  }, [userBooks]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      const createdUrls: string[] = [];

      for (const b of userBooks) {
        const src = userBookCoverSources[b.id];
        if (!src) continue;
        if (src.url) {
          next[b.id] = src.url;
          continue;
        }
        if (!src.blobKey) continue;
        try {
          const blob = await getBlob(src.blobKey);
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          next[b.id] = url;
        } catch {
          // ignore
        }
      }

      if (cancelled) {
        createdUrls.forEach((u) => {
          if (u.startsWith("blob:")) URL.revokeObjectURL(u);
        });
        return;
      }

      setBookCoverUrls((prev) => {
        Object.entries(prev).forEach(([id, u]) => {
          const nu = next[id];
          if (u && u.startsWith("blob:") && u !== nu) URL.revokeObjectURL(u);
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [userBooks, userBookCoverSources]);

  const openEdit = (b: MangaBook) => {
    setEditingBook(b);
  };


  const deleteBookAndCleanup = async (bookId: string) => {
    if (!bookId) return;
    if (bookId === QUICK_BOOK_ID) {
      await alert({ title: "提示", message: "系统书籍不可删除" });
      return;
    }
    const b = books.find((x) => x.id === bookId);
    if (!b) return;
    const ok = await confirm({ title: "确认删除", message: `确定删除书籍“${b.title}”吗？\n\n将同时删除该书下的章节与页面（本地数据不可恢复）。`, variant: "danger", confirmLabel: "删除" });
    if (!ok) return;

    setBookMenuOpenId("");
    const removed = deleteBook(bookId);
    if (!removed) return;

    const keys = getAllBlobKeysFromBook(removed);
    await Promise.all(
      keys.map(async (k) => {
        try {
          await deleteBlob(k);
        } catch {
          // ignore
        }
      }),
    );
  };

  return (
    <>
      <AppShell title="书架" onOpenSettings={() => setShowSettingsModal(true)}>
        <div className="view-section max-w-6xl mx-auto space-y-8 pb-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-800">我的书架</h2>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2 shadow-lg shadow-indigo-200"
            >
              <Plus className="w-4 h-4" /> 创建书籍
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {/* Quick Book */}
            <Link href={`/shelf/${encodeURIComponent(quick.id)}`} className="group cursor-pointer">
              <div className="aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden relative shadow-sm border border-slate-200 card-hover group-hover:ring-4 ring-slate-100 transition-all flex items-center justify-center">
                <span className="text-sm font-bold text-slate-400">翻译内容</span>
              </div>
              <div className="mt-3 px-1">
                <h4 className="font-bold text-slate-800 text-base truncate group-hover:text-indigo-600 transition-colors">{quick.title}</h4>
                <p className="text-xs text-slate-500 mt-1">系统收纳 · {quick.chapters.length} 话</p>
              </div>
            </Link>

            {/* User Books */}
            {userBooks.map((b) => {
              const coverUrl = bookCoverUrls[b.id] || "";
              const coverSrc = userBookCoverSources[b.id];
              return (
                <div key={b.id} className="group cursor-pointer relative">
                  {/* Context Menu */}
                  <div className="absolute top-2 right-2 z-20" ref={bookMenuOpenId === b.id ? bookMenuRef : null}>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg bg-white/90 border border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-all"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setBookMenuOpenId((prev) => (prev === b.id ? "" : b.id));
                      }}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {bookMenuOpenId === b.id && (
                      <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-xl p-1 z-30">
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 rounded-lg transition-colors"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBookMenuOpenId(""); openEdit(b); }}
                        >
                          <Pencil className="w-3.5 h-3.5" /> 编辑书籍
                        </button>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 rounded-lg transition-colors"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBookMenuOpenId(""); setCoverTargetBookId(b.id); coverInputRef.current?.click(); }}
                        >
                          <Import className="w-3.5 h-3.5" /> 更换封面
                        </button>
                        <div className="my-0.5 mx-1 h-px bg-slate-100" />
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 hover:text-red-600 flex items-center gap-2 rounded-lg transition-colors"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); void deleteBookAndCleanup(b.id); }}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 删除书籍
                        </button>
                      </div>
                    )}
                  </div>

                  <Link href={`/shelf/${encodeURIComponent(b.id)}`}>
                    <div className="aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden relative shadow-sm border border-slate-200 card-hover group-hover:ring-4 ring-slate-100 transition-all">
                      <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/20 to-transparent z-10 border-r border-black/5" />
                      {coverUrl ? (
                        <img src={coverUrl} alt={b.title} className="w-full h-full object-cover" />
                      ) : coverSrc?.kind === "empty" ? (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      ) : (
                        <div className="w-full h-full bg-slate-50" />
                      )}
                    </div>
                    <div className="mt-3 px-1">
                      <h4 className="font-bold text-slate-800 text-base truncate group-hover:text-indigo-600 transition-colors">{b.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">共 {b.chapters.length} 话</p>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </AppShell>

      <BookEditModal
        mode="create"
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <BookEditModal
        mode="edit"
        open={!!editingBook}
        onClose={() => setEditingBook(null)}
        bookId={editingBook?.id}
        initialTitle={editingBook?.title}
        initialDescription={editingBook?.description}
      />

      <SettingsModal open={showSettingsModal} onClose={() => setShowSettingsModal(false)} />

      <input
        ref={coverInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !coverTargetBookId) return;
          void (async () => {
            try {
              const blobKey = await putBlob(file, { dir: `${coverTargetBookId}/_covers`, name: file.name });
              setBookCover({ bookId: coverTargetBookId, coverBlobKey: blobKey, coverUrl: undefined });
            } catch { /* ignore */ }
          })();
          e.target.value = "";
          setCoverTargetBookId("");
        }}
      />
    </>
  );
}
