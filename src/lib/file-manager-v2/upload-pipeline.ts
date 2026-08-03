import { humanizeUploadHttpError } from "@/lib/api/parse-response";
import { getFileExtension, getMimeTypeFromFileName } from "@/lib/file-utils";
import type { FmUploadContext, FmUploadResult } from "@/lib/file-manager-v2/types";
import { FM2_MAX_RETRIES, FM2_RETRY_DELAY_MS } from "@/lib/file-manager-v2/constants";
import {
  createPerfSession,
  readServerTimeMs,
  type PerfSession,
} from "@/lib/file-manager-v2/upload-perf";
import { setGeometryInIdb } from "@/lib/orders/geometry-cache";
import { parseModelGeometry } from "@/lib/orders/parse-model-worker";
import { thumbnailFromGeometry } from "@/lib/orders/thumbnail-from-geometry";

type PrepareResponse = {
  success: boolean;
  data?: {
    upload?: {
      fileId: string;
      storagePath: string;
      signedUrl: string;
      mimeType: string;
      fileType: string;
      category: string;
      slotKey: string;
      versionKey: string;
      version: number;
      replacesId: string | null;
      bucket: string;
    };
  };
  error?: { message?: string };
};

type CompleteResponse = {
  success: boolean;
  data?: { file?: { id?: string }; message?: string };
  error?: { message?: string };
};

type PreparedUpload = NonNullable<NonNullable<PrepareResponse["data"]>["upload"]>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("רשת") ||
    msg.includes("network") ||
    msg.includes("Network") ||
    msg.includes("Failed to fetch") ||
    msg.includes("timeout") ||
    msg.includes("Storage")
  );
}

/** Verify/DB failures after a successful PUT — retry complete only, never re-upload. */
function isCompleteOnlyRetryable(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Storage") ||
    msg.includes("לא נמצא ב־Storage") ||
    msg.includes("שמירה בשרת") ||
    msg.includes("אימות")
  );
}

async function timedFetchJson<T>(
  method: string,
  url: string,
  body: unknown | undefined,
  signal: AbortSignal | undefined,
  perf: PerfSession,
  endpointLabel: string,
): Promise<{ status: number; json: T | null; text: string; headers: Headers }> {
  const t0 = performance.now();
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const text = await res.text();
  const totalMs = Math.round(performance.now() - t0);
  const serverMs = readServerTimeMs(res.headers);
  const networkMs = serverMs != null ? Math.max(0, totalMs - serverMs) : totalMs;

  perf.recordApi({
    endpoint: `${method} ${endpointLabel}`,
    serverMs,
    networkMs,
    totalMs,
    status: res.status,
  });

  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

function putFile(
  signedUrl: string,
  file: File,
  mimeType: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", mimeType || file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");

    const abort = () => {
      xhr.abort();
      reject(new DOMException("בוטל", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    }

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      onProgress(Math.min(90, Math.round((e.loaded / e.total) * 90)));
    };

    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(90);
        resolve();
        return;
      }
      reject(new Error(humanizeUploadHttpError(xhr.status, xhr.responseText || "העלאה נכשלה")));
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("שגיאת רשת בהעלאה"));
    };
    xhr.ontimeout = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("timeout בהעלאה ל-Storage"));
    };
    // Surface hung PUTs — default XHR has no timeout (can sit ~60s+)
    xhr.timeout = 120_000;
    xhr.send(file);
  });
}

function enrichModelInBackground(file: File, fileId: string): void {
  const ext = getFileExtension(file.name);
  if (!["stl", "ply", "obj", "glb", "gltf"].includes(ext)) return;
  if (file.size > 120 * 1024 * 1024) return;

  void (async () => {
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseModelGeometry(file.name, buffer, {
        forceWorker: file.size >= 2 * 1024 * 1024,
      });
      await setGeometryInIdb({
        fileId,
        fileSize: file.size,
        positions: parsed.positions,
        normals: parsed.normals,
        colors: parsed.colors,
        indices: parsed.indices,
        meta: parsed.meta,
        cachedAt: Date.now(),
      });
      void thumbnailFromGeometry(parsed);
    } catch {
      /* optional — never on critical path */
    }
  })();
}

async function prepareUpload(
  file: File,
  ctx: FmUploadContext,
  signal: AbortSignal | undefined,
  perf: PerfSession,
): Promise<PreparedUpload> {
  const mimeType =
    (file.type && file.type !== "application/octet-stream" ? file.type : null) ||
    getMimeTypeFromFileName(file.name);

  const prepared = await timedFetchJson<PrepareResponse>(
    "POST",
    "/api/orders/files/prepare",
    {
      orderId: ctx.orderId,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      notes: ctx.notes,
      uploadSlotId: ctx.uploadSlotId,
      versionMode: "new_version",
    },
    signal,
    perf,
    "/api/orders/files/prepare",
  );

  if (prepared.status < 200 || prepared.status >= 300 || !prepared.json?.success) {
    throw new Error(prepared.json?.error?.message || "הכנת העלאה נכשלה");
  }

  const upload = prepared.json.data?.upload;
  if (!upload?.signedUrl || !upload.fileId) {
    throw new Error("קישור העלאה לא תקין");
  }
  return upload;
}

async function completeUpload(
  file: File,
  ctx: FmUploadContext,
  upload: PreparedUpload,
  mimeType: string,
  signal: AbortSignal | undefined,
  perf: PerfSession,
): Promise<FmUploadResult> {
  // Server: VERIFY_STORAGE + CREATE_DATABASE_RECORD inside /complete
  const completed = await timedFetchJson<CompleteResponse>(
    "POST",
    "/api/orders/files/complete",
    {
      orderId: ctx.orderId,
      fileId: upload.fileId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: upload.mimeType || mimeType,
      fileType: upload.fileType,
      storagePath: upload.storagePath,
      notes: ctx.notes,
      category: upload.category,
      slotKey: upload.slotKey,
      versionKey: upload.versionKey,
      version: upload.version,
      replacesId: upload.replacesId,
      modelMeta: null,
      thumbnailDataUrl: null,
    },
    signal,
    perf,
    "/api/orders/files/complete",
  );

  if (completed.status < 200 || completed.status >= 300 || !completed.json?.success) {
    throw new Error(completed.json?.error?.message || "שמירה בשרת נכשלה");
  }

  // Split server time approx: complete includes verify+db — attribute to both for report
  const completeApi = perf.steps;
  void completeApi;

  return {
    fileId: completed.json.data?.file?.id ?? upload.fileId,
    message: completed.json.data?.message,
  };
}

export type Fm2UploadOptions = {
  localId?: string;
  perf?: PerfSession;
  /** Draft already existed before this file — CREATE_DRAFT = 0 */
  draftAlreadyReady?: boolean;
  /** When false, caller prints the final report (after UI_RENDER). Default true. */
  autoFinish?: boolean;
};

/** FM2 upload with step timings printed to console `[fm2-perf]`. */
export async function fm2UploadFile(
  file: File,
  ctx: FmUploadContext,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
  options?: Fm2UploadOptions,
): Promise<FmUploadResult> {
  const ownsPerf = !options?.perf;
  const perf =
    options?.perf ??
    createPerfSession(file.name, file.size, options?.localId ?? `fm2-${Date.now()}`);
  const autoFinish = options?.autoFinish ?? ownsPerf;

  if (options?.draftAlreadyReady) {
    perf.steps.CREATE_DRAFT = 0;
    perf.flags.draftCreated = false;
  }

  const done = (result: FmUploadResult) => {
    perf.steps.GENERATE_THUMBNAIL = 0;
    perf.flags.thumbnailOnCriticalPath = false;
    perf.flags.base64 = false;
    if (autoFinish) perf.finish();
    return result;
  };

  let lastError: unknown;
  let putSucceeded = false;
  let prepared: PreparedUpload | null = null;
  const mimeType =
    (file.type && file.type !== "application/octet-stream" ? file.type : null) ||
    getMimeTypeFromFileName(file.name);

  for (let attempt = 1; attempt <= FM2_MAX_RETRIES; attempt++) {
    try {
      if (putSucceeded && prepared) {
        // PUT already OK — never re-upload; only retry verify+DB
        perf.flags.retryAfterSuccess = true;
        onProgress(93);
        const tComplete = performance.now();
        const result = await completeUpload(file, ctx, prepared, mimeType, signal, perf);
        const completeMs = Math.round(performance.now() - tComplete);
        const lastComplete = [...perf.apis].reverse().find((a) =>
          a.endpoint.includes("/complete"),
        );
        perf.steps.VERIFY_STORAGE = lastComplete?.totalMs ?? completeMs;
        perf.steps.CREATE_DATABASE_RECORD = lastComplete?.serverMs ?? 0;
        onProgress(100);
        enrichModelInBackground(file, result.fileId);
        return done(result);
      }

      if (attempt > 1) {
        perf.flags.doubleUpload = true;
      }

      onProgress(2);
      prepared = await perf.span("GET_UPLOAD_URL", () =>
        prepareUpload(file, ctx, signal, perf),
      );
      onProgress(5);
      await perf.span("UPLOAD_TO_STORAGE", () =>
        putFile(prepared!.signedUrl, file, prepared!.mimeType || mimeType, onProgress, signal),
      );
      putSucceeded = true;
      onProgress(93);

      const tComplete = performance.now();
      const result = await completeUpload(file, ctx, prepared, mimeType, signal, perf);
      const completeMs = Math.round(performance.now() - tComplete);
      const lastComplete = [...perf.apis].reverse().find((a) =>
        a.endpoint.includes("/complete"),
      );
      // complete endpoint = verify + DB insert (server) + network
      perf.steps.VERIFY_STORAGE = lastComplete?.totalMs ?? completeMs;
      perf.steps.CREATE_DATABASE_RECORD = lastComplete?.serverMs ?? 0;
      perf.flags.refreshList = false;
      onProgress(100);
      enrichModelInBackground(file, result.fileId);
      return done(result);
    } catch (err) {
      lastError = err;
      const canRetry = putSucceeded
        ? isCompleteOnlyRetryable(err)
        : isRetryable(err);
      if (!canRetry || attempt === FM2_MAX_RETRIES) break;
      await perf.span("RETRY_WAIT", () => sleep(FM2_RETRY_DELAY_MS * attempt));
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  if (autoFinish) perf.finish(message);
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export { createPerfSession } from "@/lib/file-manager-v2/upload-perf";
