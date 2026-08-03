import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk } from "@/lib/api/response";
import { detectFileType, getMimeTypeFromFileName } from "@/lib/file-utils";
import { assertCanUploadOrderFile, requireSessionUser } from "@/lib/rbac";
import { uploadOrderFileViaProxy } from "@/lib/orders/order-file-upload";
import type { OrderFileCategory } from "@/lib/orders/order-file-taxonomy";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 500) * 1024 * 1024;
/** Prefer direct-to-Storage for anything larger — proxy hits platform body limits. */
const PROXY_SOFT_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * Legacy multipart proxy upload (small files / fallback).
 * Large scans should use /prepare + signed PUT + /complete.
 */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanUploadOrderFile(user);
    const userId = user.id;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new AppError(
        "UPLOAD_ERROR",
        "גוף הבקשה גדול מדי או לא תקין. השתמשו בהעלאה ישירה ל־Storage.",
        413,
      );
    }

    const orderId = formData.get("orderId");
    const file = formData.get("file");
    const notes = formData.get("notes");
    const uploadSlotId = formData.get("uploadSlotId");
    const category = formData.get("category");
    const slotKey = formData.get("slotKey");
    const versionKey = formData.get("versionKey");
    const versionMode = formData.get("versionMode");

    if (typeof orderId !== "string" || !orderId) {
      throw new AppError("VALIDATION_ERROR", "מזהה הזמנה חסר", 400);
    }
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "קובץ חסר", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError(
        "UPLOAD_ERROR",
        `גודל הקובץ חורג מהמגבלה (${process.env.MAX_UPLOAD_SIZE_MB || 500}MB)`,
        400,
      );
    }
    if (file.size > PROXY_SOFT_LIMIT_BYTES) {
      throw new AppError(
        "UPLOAD_ERROR",
        "הקובץ גדול מדי להעלאה דרך השרת. יש להשתמש בהעלאה ישירה ל־Storage.",
        413,
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) {
      throw new AppError("UPLOAD_ERROR", "קובץ ריק או שההעלאה נקטעה — נסו שוב", 400);
    }

    const mimeType =
      (file.type && file.type !== "application/octet-stream"
        ? file.type
        : null) || getMimeTypeFromFileName(file.name);

    const created = await uploadOrderFileViaProxy({
      orderId,
      userId,
      fileName: file.name,
      fileType: detectFileType(file.name),
      fileSize: file.size,
      mimeType,
      buffer,
      notes: typeof notes === "string" ? notes : undefined,
      uploadSlotId: typeof uploadSlotId === "string" ? uploadSlotId : undefined,
      category: typeof category === "string" ? (category as OrderFileCategory) : undefined,
      slotKey: typeof slotKey === "string" ? slotKey : undefined,
      versionKey: typeof versionKey === "string" ? versionKey : undefined,
      versionMode:
        versionMode === "new_version" || versionMode === "replace"
          ? versionMode
          : undefined,
    });

    return jsonOk({ file: created, message: "הקובץ נשמר בהצלחה." });
  } catch (error) {
    console.error("[api/orders/files] upload failed", error);
    return jsonError(error);
  }
}
