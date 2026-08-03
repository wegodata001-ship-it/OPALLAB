import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanUploadOrderFile, requireSessionUser } from "@/lib/rbac";
import { prepareOrderFileUpload } from "@/lib/orders/order-file-upload";
import type { OrderFileCategory } from "@/lib/orders/order-file-taxonomy";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 500) * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanUploadOrderFile(user);

    const body = await parseJsonBody<{
      orderId?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string | null;
      notes?: string;
      uploadSlotId?: string | null;
      category?: OrderFileCategory;
      slotKey?: string;
      versionKey?: string;
      versionMode?: "new_version" | "replace";
    }>(request);

    if (!body.orderId || !body.fileName) {
      throw new AppError("VALIDATION_ERROR", "חסרים פרטי קובץ להעלאה", 400);
    }
    if (typeof body.fileSize !== "number" || body.fileSize <= 0) {
      throw new AppError("VALIDATION_ERROR", "גודל קובץ לא תקין", 400);
    }
    if (body.fileSize > MAX_UPLOAD_BYTES) {
      throw new AppError(
        "UPLOAD_ERROR",
        `גודל הקובץ חורג מהמגבלה (${process.env.MAX_UPLOAD_SIZE_MB || 500}MB)`,
        400,
      );
    }

    const prepared = await prepareOrderFileUpload({
      orderId: body.orderId,
      userId: user.id,
      fileName: body.fileName,
      fileSize: body.fileSize,
      mimeType: body.mimeType,
      notes: body.notes,
      uploadSlotId: body.uploadSlotId,
      category: body.category,
      slotKey: body.slotKey,
      versionKey: body.versionKey,
      versionMode: body.versionMode,
    });

    return jsonOk({ upload: prepared });
  } catch (error) {
    return jsonError(error);
  }
}
