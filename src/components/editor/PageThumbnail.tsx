"use client";

import { useEffect, useState } from "react";
import { getBlob } from "@/lib/blobDb";

interface PageThumbnailProps {
  blobKey?: string;
  pageNumber: number;
}

export function PageThumbnail({ blobKey, pageNumber }: PageThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (blobKey) {
      getBlob(blobKey).then((blob) => {
        if (active && blob) {
          setUrl(URL.createObjectURL(blob));
        }
      });
    }
    return () => {
      active = false;
      // We don't revoke immediately to avoid flickering if re-mounted quickly, 
      // but in a real app we should manage object URL lifecycle better.
      // For thumbnails, letting GC handle it or simple revocation on unmount is okay for small sets.
    };
  }, [blobKey]);

  if (url) {
    return <img src={url} alt={`Page ${pageNumber}`} className="w-full h-full object-cover" />;
  }

  return (
    <span className="z-10 text-slate-400 font-bold">P{pageNumber}</span>
  );
}
