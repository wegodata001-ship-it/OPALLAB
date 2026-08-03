import { humanizeUploadHttpError } from "@/lib/api/parse-response";
import { getFileExtension, getMimeTypeFromFileName } from "@/lib/file-utils";
import { setGeometryInIdb } from "@/lib/orders/geometry-cache";
import { parseModelGeometry } from "@/lib/orders/parse-model-worker";
import { thumbnailFromGeometry } from "@/lib/orders/thumbnail-from-geometry";
import { uploadAudit } from "@/lib/orders/upload-audit";

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

type PrepareResponse = {
  success: boolean;
  data?: {
    upload?: {
      fileId: string;
      storagePath: string;
      signedUrl: string;
      token: string;
      bucket: string;
      mimeType: string;
      fileType: string;
      category: string;
      slotKey: string;
      versionKey: string;
      version: number;
      replacesId: string | null;
    };
  };
  error?: { message?: string; code?: string; details?: FileVersionConflict };
};

type CompleteResponse = {
  success: boolean;
  data?: { file?: { id?: string }; message?: string };
  error?: { message?: string };
};

function parseXhrJson<T>(xhr: XMLHttpRequest): T | null {
  const text = (xhr.responseText || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function xhrJson<T>(method: string, url: string, body: unknown): Promise<{ status: number; json: T | null; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onload = () => {
      resolve({
        status: xhr.status,
        json: parseXhrJson<T>(xhr),
        text: xhr.responseText || "",
      });
    };
    xhr.onerror = () => reject(new Error("שגיאת רשת בהעלאה"));
    xhr.send(JSON.stringify(body));
  });
}

function putFileToSignedUrl(
  signedUrl: string,
  file: File,
  mimeType: string,
  onProgress?: (pct: number, loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", mimeType || file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("ההעלאה בוטלה", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      onProgress?.(pct, event.loaded, event.total);
    };

    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100, file.size, file.size);
        resolve();
        return;
      }
      reject(
        new Error(
          humanizeUploadHttpError(xhr.status, xhr.responseText || "העלאה ל־Storage נכשלה"),
        ),
      );
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("שגיאת רשת בהעלאה ל־Storage"));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("ההעלאה בוטלה", "AbortError"));
    };
    xhr.send(file);
  });
}

function isRetryableUploadError(err: unknown): boolean {
  if (err instanceof UploadConflictError) return false;
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("רשת") ||
    message.includes("network") ||
    message.includes("Network") ||
    message.includes("Failed to fetch") ||
    message.includes("timeout") ||
    message.includes("Timeout")
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Direct-to-Storage upload:
 * prepare (JSON) → PUT file to signed URL → complete (verify Storage + DB).
 * Bypasses Vercel/proxy body limits that cause "Unexpected token 'R'".
 * Retries automatically on transient network failures.
 */
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
  signal?: AbortSignal;
  onProgress?: (pct: number, meta?: { loaded: number; total: number; fileName: string }) => void;
}): Promise<{ fileId?: string; message?: string }> {
  const mimeType =
    (input.file.type && input.file.type !== "application/octet-stream"
      ? input.file.type
      : null) || getMimeTypeFromFileName(input.file.name);

  const report = (pct: number, loaded = 0, total = input.file.size) => {
    input.onProgress?.(pct, {
      loaded,
      total,
      fileName: input.file.name,
    });
  };

  const attemptOnce = async () => {
    report(0);
    uploadAudit({
      step: "UPLOAD_START",
      orderId: input.orderId,
      fileName: input.file.name,
      size: input.file.size,
      mimeType,
      extra: { uploadSlotId: input.uploadSlotId ?? null },
    });

    const prepared = await xhrJson<PrepareResponse>("POST", "/api/orders/files/prepare", {
      orderId: input.orderId,
      fileName: input.file.name,
      fileSize: input.file.size,
      mimeType,
      notes: input.notes,
      uploadSlotId: input.uploadSlotId,
      category: input.category,
      slotKey: input.slotKey,
      versionKey: input.versionKey,
      versionMode: input.versionMode,
      folderId: input.folderId,
    });

    if (prepared.status === 409) {
      const details = prepared.json?.error?.details;
      if (details?.existing) {
        throw new UploadConflictError({
          code: "FILE_VERSION_CONFLICT",
          existing: details.existing,
        });
      }
      throw new UploadConflictError({
        code: "FILE_VERSION_CONFLICT",
        existing: {
          id: "",
          fileName: prepared.json?.error?.message ?? "קובץ קיים",
          version: 1,
        },
      });
    }

    if (prepared.status < 200 || prepared.status >= 300 || !prepared.json?.success) {
      throw new Error(
        prepared.json?.error?.message ||
          humanizeUploadHttpError(prepared.status, prepared.text || "הכנת ההעלאה נכשלה"),
      );
    }

    const upload = prepared.json.data?.upload;
    if (!upload?.signedUrl || !upload.storagePath || !upload.fileId) {
      throw new Error("השרת לא החזיר קישור העלאה תקין");
    }

    if (input.signal?.aborted) {
      throw new DOMException("ההעלאה בוטלה", "AbortError");
    }

    // Progress 0–85 during Storage PUT
    await putFileToSignedUrl(
      upload.signedUrl,
      input.file,
      upload.mimeType || mimeType,
      (pct, loaded, total) => {
        report(Math.min(85, Math.round(pct * 0.85)), loaded, total);
      },
      input.signal,
    );

    report(86, input.file.size, input.file.size);

    // Parse once at upload (Worker for large meshes) — persist meta + thumb + geometry cache
    let modelMeta: Awaited<ReturnType<typeof parseModelGeometry>>["meta"] | null = null;
    let thumbnailDataUrl: string | null = null;
    const ext = getFileExtension(input.file.name);
    if (["stl", "ply", "obj", "glb", "gltf"].includes(ext) && input.file.size <= 120 * 1024 * 1024) {
      try {
        const buffer = await input.file.arrayBuffer();
        const parsed = await parseModelGeometry(input.file.name, buffer, {
          forceWorker: input.file.size >= 2 * 1024 * 1024,
        });
        modelMeta = parsed.meta;
        await setGeometryInIdb({
          fileId: upload.fileId,
          fileSize: input.file.size,
          positions: parsed.positions,
          normals: parsed.normals,
          colors: parsed.colors,
          indices: parsed.indices,
          meta: parsed.meta,
          cachedAt: Date.now(),
        });
        const thumbBlob = await thumbnailFromGeometry(parsed);
        if (thumbBlob) {
          thumbnailDataUrl = await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(thumbBlob);
          });
        }
      } catch (err) {
        console.warn("[upload] model parse-at-upload skipped", err);
      }
    }

    report(92, input.file.size, input.file.size);

    const completed = await xhrJson<CompleteResponse>("POST", "/api/orders/files/complete", {
      orderId: input.orderId,
      fileId: upload.fileId,
      fileName: input.file.name,
      fileSize: input.file.size,
      mimeType: upload.mimeType || mimeType,
      fileType: upload.fileType,
      storagePath: upload.storagePath,
      notes: input.notes,
      category: upload.category,
      slotKey: upload.slotKey,
      versionKey: upload.versionKey,
      version: upload.version,
      replacesId: upload.replacesId,
      modelMeta,
      thumbnailDataUrl,
    });

    if (completed.status < 200 || completed.status >= 300 || !completed.json?.success) {
      throw new Error(
        completed.json?.error?.message ||
          humanizeUploadHttpError(completed.status, completed.text),
      );
    }

    report(100, input.file.size, input.file.size);
    const fileId = completed.json.data?.file?.id ?? upload.fileId;
    uploadAudit({
      step: "UPLOAD_DONE",
      orderId: input.orderId,
      fileId,
      fileName: input.file.name,
      size: input.file.size,
      mimeType: upload.mimeType || mimeType,
      bucket: upload.bucket,
      storagePath: upload.storagePath,
      category: upload.category,
      slotKey: upload.slotKey,
      success: true,
    });
    return {
      fileId,
      message: completed.json.data?.message ?? "הקובץ נשמר בהצלחה.",
    };
  };

  return (async () => {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await attemptOnce();
      } catch (err) {
        lastError = err;
        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          err instanceof UploadConflictError ||
          !isRetryableUploadError(err) ||
          attempt === maxAttempts
        ) {
          uploadAudit({
            step: "UPLOAD_FAILED",
            orderId: input.orderId,
            fileName: input.file.name,
            size: input.file.size,
            mimeType,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            extra: { attempt },
          });
          throw err;
        }
        await sleep(400 * attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("העלאה נכשלה");
  })();
}
