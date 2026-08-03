import {
  UploadConflictError,
  uploadOrderFileWithProgress,
  type UploadVersionMode,
} from "@/lib/orders/upload-with-progress";
import type { OrderUploadSlotId } from "@/lib/orders/upload-slots";
import { loadDraftAll } from "@/lib/orders/draft-upload-store";
import { slotNotes } from "@/lib/orders/upload-slots";

export type PendingSlotUpload = {
  slotId: OrderUploadSlotId;
  file: File;
  notes: string;
};

export type PersistUploadsOptions = {
  /** Ask user replace vs new version on same-name conflict. */
  askVersionMode?: (
    fileName: string,
    existingName: string,
    existingVersion: number,
  ) => Promise<UploadVersionMode | null>;
  onFileStart?: (file: File, slotId: OrderUploadSlotId, index: number, total: number) => void;
  onFileProgress?: (file: File, pct: number) => void;
  onFileDone?: (file: File, slotId: OrderUploadSlotId) => void;
  onFileError?: (file: File, error: Error) => void;
};

/**
 * Persist selected create-order slot files to Storage + DB for a real orderId.
 * Independent of React tile state (safe after remount / refresh).
 */
export async function persistSlotUploads(
  orderId: string,
  pending: PendingSlotUpload[],
  options: PersistUploadsOptions = {},
): Promise<{ uploaded: number }> {
  if (!orderId) throw new Error("מזהה הזמנה חסר — לא ניתן לשמור קבצים");
  if (!pending.length) return { uploaded: 0 };

  console.info("[orders/upload] persisting files", {
    orderId,
    count: pending.length,
    names: pending.map((p) => `${p.slotId}:${p.file.name}`),
  });

  let uploaded = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i]!;
    options.onFileStart?.(item.file, item.slotId, i, pending.length);

    try {
      await uploadOneWithConflict(orderId, item, options);
      uploaded += 1;
      options.onFileDone?.(item.file, item.slotId);
      console.info("[orders/upload] saved", {
        orderId,
        slotId: item.slotId,
        fileName: item.file.name,
        size: item.file.size,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[orders/upload] failed", {
        orderId,
        slotId: item.slotId,
        fileName: item.file.name,
        message: error.message,
      });
      options.onFileError?.(item.file, error);
      throw error;
    }
  }

  return { uploaded };
}

async function uploadOneWithConflict(
  orderId: string,
  item: PendingSlotUpload,
  options: PersistUploadsOptions,
  versionMode?: UploadVersionMode,
): Promise<void> {
  try {
    await uploadOrderFileWithProgress({
      orderId,
      file: item.file,
      notes: item.notes || slotNotes(item.slotId),
      uploadSlotId: item.slotId,
      versionMode,
      onProgress: (pct) => options.onFileProgress?.(item.file, pct),
    });
  } catch (err) {
    if (err instanceof UploadConflictError) {
      const mode = options.askVersionMode
        ? await options.askVersionMode(
            item.file.name,
            err.conflict.existing.fileName,
            err.conflict.existing.version,
          )
        : "new_version";
      if (!mode) throw new Error("ההעלאה בוטלה — הקובץ לא נשמר");
      await uploadOrderFileWithProgress({
        orderId,
        file: item.file,
        notes: item.notes || slotNotes(item.slotId),
        uploadSlotId: item.slotId,
        versionMode: mode,
        onProgress: (pct) => options.onFileProgress?.(item.file, pct),
      });
      return;
    }
    throw err;
  }
}

/** Fallback: rebuild pending list from IndexedDB draft if React state was cleared. */
export async function loadPendingFromDraft(draftKey: string): Promise<PendingSlotUpload[]> {
  const draft = await loadDraftAll(draftKey);
  const out: PendingSlotUpload[] = [];
  for (const [slotId, files] of draft) {
    for (const file of files) {
      out.push({ slotId, file, notes: slotNotes(slotId) });
    }
  }
  return out;
}
