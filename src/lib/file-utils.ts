import type { FileType } from "@/lib/types";

const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

export type PreviewKind = "image" | "pdf" | "html" | "model3d" | "zip" | "plx" | "none";

export function detectFileType(fileName: string): FileType {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, FileType> = {
    plx: "PLX",
    stl: "STL",
    obj: "OBJ",
    ply: "PLY",
    html: "OTHER_3D",
    htm: "OTHER_3D",
    jpg: "IMAGE",
    jpeg: "IMAGE",
    png: "IMAGE",
    gif: "IMAGE",
    webp: "IMAGE",
    pdf: "DOCUMENT",
    doc: "DOCUMENT",
    docx: "DOCUMENT",
    zip: "DOCUMENT",
  };
  return map[ext] ?? "OTHER_3D";
}

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function getPreviewKind(mimeType?: string | null, fileName?: string): PreviewKind {
  const ext = fileName ? getFileExtension(fileName) : "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext) || mimeType?.startsWith("image/")) return "image";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["html", "htm"].includes(ext) || mimeType === "text/html") return "html";
  if (["stl", "obj", "ply"].includes(ext)) return "model3d";
  if (ext === "zip" || mimeType === "application/zip") return "zip";
  if (ext === "plx") return "plx";
  return "none";
}

export function isPreviewable(mimeType?: string | null, fileName?: string): boolean {
  return getPreviewKind(mimeType, fileName) !== "none";
}

export function isDentalScanHtml(content: string): boolean {
  const lower = content.toLowerCase();
  const markers = ["webgl", "three", "orbitcontrols", "stl", "3d viewer", "canvas", "getcontext"];
  return markers.filter((m) => lower.includes(m)).length >= 2;
}

export function getMimeTypeFromFileName(fileName: string): string {
  const ext = getFileExtension(fileName);
  const map: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    stl: "model/stl",
    obj: "model/obj",
    ply: "application/octet-stream",
    zip: "application/zip",
    js: "application/javascript",
    css: "text/css",
    json: "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}

export function getOrderFileFolderId(file: { id: string; storagePath?: string | null }): string {
  if (file.storagePath) {
    const parts = file.storagePath.split("/");
    if (parts.length >= 2) return parts[1];
  }
  return file.id;
}

export function buildFileViewUrl(orderId: string, folderId: string, assetPath?: string): string {
  const base = `/api/orders/files/view/${orderId}/${folderId}`;
  if (!assetPath) return base;
  const normalized = assetPath.split("/").map(encodeURIComponent).join("/");
  return `${base}/${normalized}`;
}

export async function readFileForUpload(file: File): Promise<{ dataUrl: string | null; mimeType: string }> {
  if (file.size > MAX_PREVIEW_BYTES) {
    return { dataUrl: null, mimeType: file.type || "application/octet-stream" };
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType: file.type || "application/octet-stream" });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
