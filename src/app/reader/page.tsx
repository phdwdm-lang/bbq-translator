"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReaderPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/translate");
  }, [router]);

  return null;
}
