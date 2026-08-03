/**
 * Structured end-to-end audit trail for order file uploads.
 * Filter browser console by `[upload-audit]`.
 */

export type UploadAuditStep =
  | "CREATE_DRAFT"
  | "CREATE_ORDER"
  | "GENERATE_ORDER_ID"
  | "ENSURE_ORDER_ID"
  | "UPLOAD_START"
  | "PREPARE"
  | "STORAGE_UPLOAD"
  | "DATABASE_INSERT"
  | "CATEGORY"
  | "UPLOAD_DONE"
  | "UPLOAD_FAILED"
  | "FINALIZE_DRAFT"
  | "REFRESH_FILES"
  | "REFRESH_UI"
  | "VERIFY_DB"
  | "INVALIDATE_CACHE";

export type UploadAuditPayload = {
  step: UploadAuditStep;
  orderId?: string | null;
  draft?: boolean;
  fileId?: string | null;
  fileName?: string;
  size?: number;
  mimeType?: string | null;
  bucket?: string;
  storagePath?: string;
  url?: string | null;
  category?: string;
  slotKey?: string;
  versionKey?: string;
  success?: boolean;
  error?: string;
  count?: number;
  extra?: Record<string, unknown>;
};

export function uploadAudit(payload: UploadAuditPayload): void {
  const line = {
    ts: new Date().toISOString(),
    ...payload,
  };
  if (payload.success === false || payload.step === "UPLOAD_FAILED") {
    console.error("[upload-audit]", line);
  } else {
    console.info("[upload-audit]", line);
  }
}
