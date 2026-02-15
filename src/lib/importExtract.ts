import JSZip, { type JSZipObject } from "jszip";

import { convertMobiToEpub, convertRarToZip } from "./translateClient";
import {
  SUPPORTED_IMAGE_EXTENSIONS as supportedExts,
  naturalCompare,
  getBasename,
  sanitizeFolderName,
  makeTimestampName,
  isSupportedImageFile,
} from "./utils";

export { getBasename, sanitizeFolderName, makeTimestampName, isSupportedImageFile };

export function makeTaskFolderName(originalFileName: string): string {
  const base = sanitizeFolderName(getBasename(originalFileName || "task"));
  return `${base}_${makeTimestampName()}`;
}

export async function extractImagesFromZip(archive: File): Promise<File[]> {
  const buf = await archive.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.values(zip.files) as JSZipObject[];
  const filesInZip = entries
    .filter((z) => !z.dir)
    .filter((z) => {
      const name = z.name;
      const dot = name.lastIndexOf(".");
      const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
      return supportedExts.has(ext);
    });

  const extracted: File[] = [];
  for (const z of filesInZip) {
    const blob = await z.async("blob");
    const baseName = z.name.split("/").pop() || z.name;
    extracted.push(new File([blob], baseName));
  }

  extracted.sort((a, b) => naturalCompare(a.name, b.name));
  return extracted;
}

export async function extractImagesFromPdf(pdfFile: File): Promise<File[]> {
  const buf = await pdfFile.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;

  type PdfPageLike = {
    getViewport: (arg: { scale: number }) => { width: number; height: number };
    render: (arg: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<unknown> };
  };

  type PdfDocLike = {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfPageLike>;
  };

  const doc = await (
    pdfjs as unknown as {
      getDocument: (arg: unknown) => { promise: Promise<PdfDocLike> };
    }
  ).getDocument({ data: buf }).promise;

  const extracted: File[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to render PDF page"))), "image/png");
    });

    const baseName = getBasename(pdfFile.name);
    const name = `${baseName}_${String(pageNum).padStart(3, "0")}.png`;
    extracted.push(new File([blob], name, { type: "image/png" }));
  }

  return extracted;
}

export async function extractImagesFromEpub(epub: File): Promise<File[]> {
  const buf = await epub.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const textFromZip = async (path: string) => {
    const f = zip.file(path);
    if (!f) throw new Error(`EPUB 缺少文件：${path}`);
    return await f.async("text");
  };

  const blobFromZip = async (path: string) => {
    const f = zip.file(path);
    if (!f) throw new Error(`EPUB 缺少文件：${path}`);
    return await f.async("blob");
  };

  const parseXml = (xml: string) => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) {
      throw new Error("EPUB XML 解析失败");
    }
    return doc;
  };

  const firstByLocalName = (doc: Document, localName: string) => {
    return (
      (doc.getElementsByTagNameNS("*", localName)[0] as Element | undefined) ??
      (doc.getElementsByTagName(localName)[0] as Element | undefined) ??
      null
    );
  };

  const elementsByLocalName = (doc: Document, localName: string) => {
    const a = Array.from(doc.getElementsByTagNameNS("*", localName) as unknown as HTMLCollectionOf<Element>);
    if (a.length > 0) return a;
    return Array.from(doc.getElementsByTagName(localName) as unknown as HTMLCollectionOf<Element>);
  };

  const joinPath = (baseDir: string, rel: string) => {
    const cleanedRel = rel.replace(/^\//, "");
    const base = baseDir.replace(/\/+$/, "");
    const full = base ? `${base}/${cleanedRel}` : cleanedRel;
    const parts = full.split("/");
    const out: string[] = [];
    for (const p of parts) {
      if (!p || p === ".") continue;
      if (p === "..") {
        out.pop();
        continue;
      }
      out.push(p);
    }
    return out.join("/");
  };

  const containerXml = await textFromZip("META-INF/container.xml");
  const containerDoc = parseXml(containerXml);
  const rootfileEl = firstByLocalName(containerDoc, "rootfile");
  const opfPath = rootfileEl?.getAttribute("full-path") || "";
  if (!opfPath) throw new Error("EPUB 缺少 OPF 路径（container.xml 无 full-path）");

  const opfXml = await textFromZip(opfPath);
  const opfDoc = parseXml(opfXml);
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";

  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const it of elementsByLocalName(opfDoc, "item")) {
    if (it.parentElement?.localName !== "manifest") continue;
    const id = it.getAttribute("id") || "";
    const href = it.getAttribute("href") || "";
    const mediaType = it.getAttribute("media-type") || "";
    if (id && href) manifest.set(id, { href, mediaType });
  }

  const spineIds = elementsByLocalName(opfDoc, "itemref")
    .filter((it) => it.parentElement?.localName === "spine")
    .map((it) => it.getAttribute("idref") || "")
    .filter(Boolean);

  const imagePathsInOrder: string[] = [];
  for (const idref of spineIds) {
    const item = manifest.get(idref);
    if (!item) continue;
    const itemPath = joinPath(opfDir, item.href);

    if (item.mediaType.startsWith("image/")) {
      imagePathsInOrder.push(itemPath);
      continue;
    }

    if (item.mediaType.includes("html") || item.mediaType.includes("xhtml") || item.mediaType.includes("xml")) {
      let html = "";
      try {
        html = await textFromZip(itemPath);
      } catch {
        continue;
      }

      const doc = new DOMParser().parseFromString(html, "text/html");
      const imgs = Array.from(doc.querySelectorAll("img"))
        .map((img) => img.getAttribute("src") || "")
        .filter(Boolean);
      const svgImgs = Array.from(doc.querySelectorAll("image"))
        .map((img) => img.getAttribute("href") || img.getAttribute("xlink:href") || "")
        .filter(Boolean);

      const refs = [...imgs, ...svgImgs];
      for (const ref of refs) {
        if (ref.startsWith("data:")) continue;
        const p = joinPath(itemPath.includes("/") ? itemPath.slice(0, itemPath.lastIndexOf("/")) : "", ref.split("#")[0] || ref);
        imagePathsInOrder.push(p);
      }
    }
  }

  const uniqInOrder = (arr: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const a of arr) {
      if (seen.has(a)) continue;
      seen.add(a);
      out.push(a);
    }
    return out;
  };

  const ordered = uniqInOrder(imagePathsInOrder);

  const fallbackAllImages = () => {
    const entries = Object.values(zip.files) as JSZipObject[];
    return entries
      .filter((z) => !z.dir)
      .map((z) => z.name)
      .filter((name) => {
        const dot = name.lastIndexOf(".");
        const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
        return supportedExts.has(ext);
      })
      .sort((a, b) => naturalCompare(a, b));
  };

  const imagePaths = ordered.length > 0 ? ordered : fallbackAllImages();
  if (imagePaths.length === 0) throw new Error("EPUB 未找到可翻译的图片");

  const extracted: File[] = [];
  for (let i = 0; i < imagePaths.length; i += 1) {
    const p = imagePaths[i];
    const blob = await blobFromZip(p);
    const leaf = p.split("/").pop() || p;
    const dot = leaf.lastIndexOf(".");
    const ext = dot >= 0 ? leaf.slice(dot).toLowerCase() : ".png";
    const name = `${getBasename(epub.name)}_${String(i + 1).padStart(3, "0")}${ext}`;
    extracted.push(new File([blob], name));
  }

  return extracted;
}

export function isEpubFile(f: File): boolean {
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  return ext === ".epub";
}

export function isMobiFile(f: File): boolean {
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  return ext === ".mobi";
}

export function isPdfFile(f: File): boolean {
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  return ext === ".pdf";
}

export function isRarFile(f: File): boolean {
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  return ext === ".rar";
}

export function isCbrFile(f: File): boolean {
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  return ext === ".cbr";
}

export function isRarArchiveFile(f: File): boolean {
  return isRarFile(f) || isCbrFile(f);
}

export function isZipArchiveFile(f: File): boolean {
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  return ext === ".zip" || ext === ".cbz";
}

export async function resolveFilesToImages(
  files: File[],
  opts?: { signal?: AbortSignal },
): Promise<{ images: File[]; nameHint: string } | null> {
  const signal = opts?.signal;

  const mobi = files.find(isMobiFile);
  if (mobi) {
    const epub = await convertMobiToEpub({ file: mobi, signal });
    const imgs = await extractImagesFromEpub(epub);
    return { images: imgs, nameHint: getBasename(mobi.name) };
  }

  const epub = files.find(isEpubFile);
  if (epub) {
    const imgs = await extractImagesFromEpub(epub);
    return { images: imgs, nameHint: getBasename(epub.name) };
  }

  const zip = files.find(isZipArchiveFile);
  if (zip) {
    const imgs = await extractImagesFromZip(zip);
    return { images: imgs, nameHint: getBasename(zip.name) };
  }

  const rar = files.find(isRarArchiveFile);
  if (rar) {
    const converted = await convertRarToZip({ file: rar, signal });
    const imgs = await extractImagesFromZip(converted);
    return { images: imgs, nameHint: getBasename(rar.name) };
  }

  const pdf = files.find(isPdfFile);
  if (pdf) {
    const imgs = await extractImagesFromPdf(pdf);
    return { images: imgs, nameHint: getBasename(pdf.name) };
  }

  return null;
}

export async function importToImages(params: {
  file: File;
  signal?: AbortSignal;
}): Promise<{ images: File[]; nameHint: string }> {
  const f = params.file;

  if (isMobiFile(f)) {
    const epub = await convertMobiToEpub({ file: f, signal: params.signal });
    const imgs = await extractImagesFromEpub(epub);
    return { images: imgs, nameHint: getBasename(f.name) };
  }

  if (isEpubFile(f)) {
    const imgs = await extractImagesFromEpub(f);
    return { images: imgs, nameHint: getBasename(f.name) };
  }

  if (isZipArchiveFile(f)) {
    const imgs = await extractImagesFromZip(f);
    return { images: imgs, nameHint: getBasename(f.name) };
  }

  if (isRarArchiveFile(f)) {
    const zip = await convertRarToZip({ file: f, signal: params.signal });
    const imgs = await extractImagesFromZip(zip);
    return { images: imgs, nameHint: getBasename(f.name) };
  }

  if (isPdfFile(f)) {
    const imgs = await extractImagesFromPdf(f);
    return { images: imgs, nameHint: getBasename(f.name) };
  }

  const list = [f].filter(isSupportedImageFile);
  if (list.length === 0) {
    throw new Error("不支持的文件类型");
  }

  return { images: list, nameHint: getBasename(f.name) };
}
