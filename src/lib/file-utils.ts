import type { FileType } from "@/lib/types";

const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

export type PreviewKind =
  | "image"
  | "pdf"
  | "html"
  | "model3d"
  | "zip"
  | "dcm"
  | "plx"
  | "none";

const MODEL3D_EXTS = ["stl", "obj", "ply", "glb", "gltf"] as const;

export function detectFileType(fileName: string): FileType {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, FileType> = {
    plx: "PLX",
    stl: "STL",
    obj: "OBJ",
    ply: "PLY",
    glb: "OTHER_3D",
    gltf: "OTHER_3D",
    html: "OTHER_3D",
    htm: "OTHER_3D",
    dcm: "OTHER_3D",
    dicom: "OTHER_3D",
    jpg: "IMAGE",
    jpeg: "IMAGE",
    png: "IMAGE",
    gif: "IMAGE",
    webp: "IMAGE",
    tiff: "IMAGE",
    tif: "IMAGE",
    bmp: "IMAGE",
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
  if (
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif"].includes(ext) ||
    mimeType?.startsWith("image/")
  ) {
    return "image";
  }
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["html", "htm"].includes(ext) || mimeType === "text/html") return "html";
  if ((MODEL3D_EXTS as readonly string[]).includes(ext)) return "model3d";
  if (ext === "zip" || mimeType === "application/zip" || mimeType === "application/x-zip-compressed") {
    return "zip";
  }
  if (ext === "dcm" || ext === "dicom" || mimeType === "application/dicom") return "dcm";
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
    tiff: "image/tiff",
    tif: "image/tiff",
    bmp: "image/bmp",
    stl: "model/stl",
    obj: "model/obj",
    ply: "application/x-ply",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    zip: "application/zip",
    dcm: "application/dicom",
    dicom: "application/dicom",
    js: "application/javascript",
    css: "text/css",
    json: "application/json",
    mtl: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * View key for /api/orders/files/view/{orderId}/{key}
 * Prefers OrderFile.id (works with structured Orders/… paths).
 * Falls back to legacy middle path segment for old uploads.
 */
export function getOrderFileFolderId(file: { id: string; storagePath?: string | null }): string {
  if (file.storagePath?.startsWith("Orders/")) {
    return file.id;
  }
  if (file.storagePath) {
    const parts = file.storagePath.split("/");
    if (parts.length >= 3 && !parts[0].startsWith("Orders")) return parts[1];
  }
  return file.id;
}

export function buildFileViewUrl(orderId: string, fileKey: string, assetPath?: string): string {
  const base = `/api/orders/files/view/${orderId}/${fileKey}`;
  if (!assetPath) return base;
  const normalized = assetPath.split("/").map(encodeURIComponent).join("/");
  return `${base}/${normalized}`;
}

export async function readFileForUpload(file: File): Promise<{ dataUrl: string | null; mimeType: string }> {
  if (file.size > MAX_PREVIEW_BYTES) {
    return { dataUrl: null, mimeType: file.type || getMimeTypeFromFileName(file.name) };
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        dataUrl: reader.result as string,
        mimeType: file.type || getMimeTypeFromFileName(file.name),
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
