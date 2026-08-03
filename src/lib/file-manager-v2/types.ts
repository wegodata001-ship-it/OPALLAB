import type { OrderUploadSlotId } from "@/lib/orders/upload-slots";
import type { FmUploadAggregate } from "@/lib/file-manager-v2/upload-state";

export type { FmUploadAggregate };

export type FmFileKind =
  | "image"
  | "model3d"
  | "pdf"
  | "video"
  | "archive"
  | "dcm"
  | "document"
  | "other";

export type FmFileStatus = "queued" | "uploading" | "done" | "error";

export type FmFile = {
  /** Local tracking id */
  id: string;
  /** Server OrderFile id after upload */
  fileId?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  kind: FmFileKind;
  previewUrl: string | null;
  progress: number;
  status: FmFileStatus;
  error?: string;
  retryCount: number;
  localFile?: File;
  orderId?: string;
  addedAt: number;
};

export type FmUploadContext = {
  orderId: string;
  uploadSlotId: OrderUploadSlotId;
  notes: string;
};

export type FmUploadResult = {
  fileId: string;
  message?: string;
};

export type FileManagerV2Handle = {
  waitForUploads: (timeoutMs?: number) => Promise<void>;
  hasUploadedFiles: () => boolean;
  hasFiles: () => boolean;
  /** Any file waiting, uploading, or failed */
  hasBlockingUploads: () => boolean;
  hasActiveUploads: () => boolean;
  getUploadAggregate: () => FmUploadAggregate;
  getFileCount: () => number;
  clearLocal: () => void;
};

export type FileManagerV2Props = {
  uploadSlotId: OrderUploadSlotId;
  orderId?: string;
  ensureOrderId?: () => Promise<string | null>;
  onChanged?: () => void;
  onUploadStateChange?: (state: FmUploadAggregate) => void;
  className?: string;
};
