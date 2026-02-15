import { MangaPage } from "../../lib/storage";
import { PageThumbnail } from "./PageThumbnail";

interface EditorNavLeftProps {
  pages: MangaPage[];
  currentPageIndex: number;
  onPageSelect: (index: number) => void;
}

export function EditorNavLeft({ pages, currentPageIndex, onPageSelect }: EditorNavLeftProps) {
  return (
    <div className="flex-1 overflow-y-auto py-3 gap-2 flex flex-col custom-scrollbar">
      {pages.map((page, idx) => {
        const isActive = idx === currentPageIndex;
        return (
          <div key={page.id} className="px-2" onClick={() => onPageSelect(idx)}>
            <div
              className={`aspect-[3/4] bg-white rounded shadow-sm cursor-pointer relative overflow-hidden transition-all ${
                isActive ? "border-2 border-indigo-500" : "border border-slate-200 hover:border-slate-300"
              }`}
            >
              <PageThumbnail blobKey={page.originalBlobKey} pageNumber={idx + 1} />
              <span className={`absolute bottom-1 right-1 text-[9px] font-bold px-1 rounded bg-white/80 ${
                isActive ? "text-indigo-600" : "text-slate-400"
              }`}>
                {idx + 1}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
