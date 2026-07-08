import type { FileType } from "@/lib/types";

const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;

export function detectFileType(fileName: string): FileType {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, FileType> = {
    plx: "PLX", stl: "STL", obj: "OBJ", ply: "PLY",
    jpg: "IMAGE", jpeg: "IMAGE", png: "IMAGE", gif: "IMAGE", webp: "IMAGE",
    pdf: "DOCUMENT", doc: "DOCUMENT", docx: "DOCUMENT",
  };
  return map[ext] ?? "OTHER_3D";
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

export function isPreviewable(mimeType?: string | null, fileName?: string): boolean {
  if (!mimeType && fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "pdf"].includes(ext ?? "");
  }
  return !!mimeType && (mimeType.startsWith("image/") || mimeType === "application/pdf");
}
