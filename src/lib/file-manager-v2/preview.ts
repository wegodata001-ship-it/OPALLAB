import { getFileExtension } from "@/lib/file-utils";
import { generateModelThumbnail } from "@/lib/orders/model-thumbnail";
import {
  canOpenInModelViewer,
  isDicomFile,
  isImageFile,
  isPdfFile,
  isRarFile,
  isVideoFile,
  isZipFile,
} from "@/lib/orders/scan-file";
import type { FmFileKind } from "@/lib/file-manager-v2/types";

export function detectFmFileKind(file: File): FmFileKind {
  if (isImageFile(file)) return "image";
  if (canOpenInModelViewer(file)) return "model3d";
  if (isPdfFile(file)) return "pdf";
  if (isVideoFile(file)) return "video";
  if (isZipFile(file) || isRarFile(file)) return "archive";
  if (isDicomFile(file)) return "dcm";
  const ext = getFileExtension(file.name);
  if (["doc", "docx", "xls", "xlsx", "txt", "csv"].includes(ext)) return "document";
  return "other";
}

export async function buildLocalPreview(file: File, kind: FmFileKind): Promise<string | null> {
  if (kind === "image" || kind === "pdf") {
    return URL.createObjectURL(file);
  }
  if (kind === "model3d") {
    return generateModelThumbnail(file);
  }
  if (kind === "video") {
    return URL.createObjectURL(file);
  }
  return null;
}

export function revokePreviewUrl(url: string | null) {
  if (url?.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}
