import { getFileExtension } from "@/lib/file-utils";
import {
  MODEL3D_EXTS,
  type Model3DExt,
  bundleFromFile,
  type LoadedModelBundle,
} from "@/lib/orders/load-model3d";

export { MODEL3D_EXTS, type Model3DExt };
export type { LoadedModelBundle };

/** Skip auto-thumbnail for very large meshes to keep UI responsive. */
export const THUMBNAIL_MAX_BYTES = 80 * 1024 * 1024;

export function isModel3DExt(ext: string): ext is Model3DExt {
  return (MODEL3D_EXTS as readonly string[]).includes(ext);
}

export function isZipFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ext === "zip" || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}

export function isDicomFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ext === "dcm" || file.type === "application/dicom";
}

export function isPdfFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ext === "pdf" || file.type === "application/pdf";
}

export function isImageFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return (
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif"].includes(ext) ||
    file.type.startsWith("image/")
  );
}

export function isVideoFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return (
    ["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext) ||
    file.type.startsWith("video/")
  );
}

export function isRarFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return (
    ext === "rar" ||
    file.type === "application/vnd.rar" ||
    file.type === "application/x-rar-compressed"
  );
}

export function isDirectModel3DFile(file: File): boolean {
  return isModel3DExt(getFileExtension(file.name));
}

export function canOpenInModelViewer(file: File): boolean {
  return isDirectModel3DFile(file) || isZipFile(file);
}

export type ResolvedModelSource = {
  buffer: ArrayBuffer;
  fileName: string;
  ext: Model3DExt;
  companions?: LoadedModelBundle["companions"];
};

/** Resolve STL/PLY/OBJ/GLB from a file or from inside a ZIP (with companions). */
export async function resolveModelSource(file: File): Promise<ResolvedModelSource | null> {
  const bundle = await bundleFromFile(file);
  if (!bundle) return null;
  return {
    buffer: bundle.buffer,
    fileName: bundle.fileName,
    ext: bundle.ext,
    companions: bundle.companions,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fileTypeLabel(file: File): string {
  const ext = getFileExtension(file.name).toUpperCase() || "FILE";
  if (isZipFile(file)) return "ZIP";
  if (isDicomFile(file)) return "DCM";
  if (isPdfFile(file)) return "PDF";
  return ext;
}
