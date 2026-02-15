export const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
]);

export const naturalCompare = (() => {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return (a: string, b: string) => collator.compare(a, b);
})();

export function getBasename(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(0, dot) : name;
}

export function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*]+/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "task";
}

export function makeTimestampName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return sanitizeFolderName(name);
}

export function isSupportedImageFile(f: File): boolean {
  if ((f.type || "").startsWith("image/")) return true;
  const dot = f.name.lastIndexOf(".");
  const ext = dot >= 0 ? f.name.slice(dot).toLowerCase() : "";
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext);
}
