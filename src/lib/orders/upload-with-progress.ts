export type UploadVersionMode = "new_version" | "replace";

export type FileVersionConflict = {
  code: "FILE_VERSION_CONFLICT";
  existing: {
    id: string;
    fileName: string;
    version: number;
    category?: string;
    slotKey?: string | null;
    uploadedAt?: string;
  };
};

export class UploadConflictError extends Error {
  conflict: FileVersionConflict;
  constructor(conflict: FileVersionConflict) {
    super("כבר קיים קובץ בקטגוריה זו");
    this.name = "UploadConflictError";
    this.conflict = conflict;
  }
}

/** Upload a single order file with XHR progress (0–100). */
export function uploadOrderFileWithProgress(input: {
  orderId: string;
  file: File;
  notes?: string;
  folderId?: string;
  uploadSlotId?: string;
  category?: string;
  slotKey?: string;
  versionKey?: string;
  versionMode?: UploadVersionMode;
  onProgress?: (pct: number) => void;
}): Promise<{ fileId?: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("orderId", input.orderId);
    formData.append("file", input.file);
    if (input.notes) formData.append("notes", input.notes);
    if (input.folderId) formData.append("folderId", input.folderId);
    if (input.uploadSlotId) formData.append("uploadSlotId", input.uploadSlotId);
    if (input.category) formData.append("category", input.category);
    if (input.slotKey) formData.append("slotKey", input.slotKey);
    if (input.versionKey) formData.append("versionKey", input.versionKey);
    if (input.versionMode) formData.append("versionMode", input.versionMode);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/orders/files");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      input.onProgress?.(pct);
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText) as {
          success: boolean;
          data?: { file?: { id?: string } };
          error?: { message?: string; code?: string; details?: FileVersionConflict };
        };

        if (xhr.status === 409) {
          const details = json.error?.details as FileVersionConflict | undefined;
          if (details?.existing) {
            reject(new UploadConflictError({
              code: "FILE_VERSION_CONFLICT",
              existing: details.existing,
            }));
            return;
          }
          reject(new UploadConflictError({
            code: "FILE_VERSION_CONFLICT",
            existing: {
              id: "",
              fileName: json.error?.message ?? "קובץ קיים",
              version: 1,
            },
          }));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300 && json.success) {
          input.onProgress?.(100);
          resolve({ fileId: json.data?.file?.id });
          return;
        }
        reject(new Error(json.error?.message ?? "העלאת הקובץ נכשלה"));
      } catch {
        reject(new Error("העלאת הקובץ נכשלה"));
      }
    };

    xhr.onerror = () => reject(new Error("שגיאת רשת בהעלאה"));
    xhr.send(formData);
  });
}
