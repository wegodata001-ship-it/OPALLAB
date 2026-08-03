import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk } from "@/lib/api/response";
import { detectFileType } from "@/lib/file-utils";
import { assertCanUploadOrderFile, requireSessionUser } from "@/lib/rbac";
import type { OrderFileCategory } from "@/lib/orders/order-file-taxonomy";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 500) * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanUploadOrderFile(user);
    const userId = user.id;
    const formData = await request.formData();
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
      throw new AppError("UPLOAD_ERROR", `גודל הקובץ חורג מהמגבלה (${process.env.MAX_UPLOAD_SIZE_MB || 500}MB)`, 400);
    }

    console.info("[api/orders/files] upload start", {
      orderId,
      fileName: file.name,
      size: file.size,
      mimeType: file.type,
      uploadSlotId: typeof uploadSlotId === "string" ? uploadSlotId : null,
      userId,
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length) {
      throw new AppError("UPLOAD_ERROR", "קובץ ריק או שההעלאה נקטעה — נסו שוב", 400);
    }

    const folderId = formData.get("folderId");
    const created = await appDataService.addOrderFile(orderId, userId, {
      fileName: file.name,
      fileType: detectFileType(file.name),
      fileSize: file.size,
      notes: typeof notes === "string" ? notes : undefined,
      mimeType: file.type || (file.name.toLowerCase().endsWith(".html") || file.name.toLowerCase().endsWith(".htm")
        ? "text/html"
        : "application/octet-stream"),
      buffer,
    }, {
      folderId: typeof folderId === "string" && folderId ? folderId : undefined,
      uploadSlotId: typeof uploadSlotId === "string" ? uploadSlotId : undefined,
      category: typeof category === "string" ? (category as OrderFileCategory) : undefined,
      slotKey: typeof slotKey === "string" ? slotKey : undefined,
      versionKey: typeof versionKey === "string" ? versionKey : undefined,
      versionMode:
        versionMode === "new_version" || versionMode === "replace"
          ? versionMode
          : undefined,
    });

    console.info("[api/orders/files] upload ok", {
      orderId,
      fileId: created.id,
      storagePath: created.storagePath,
      category: created.category,
      slotKey: created.slotKey,
    });

    return jsonOk({ file: created });
  } catch (error) {
    console.error("[api/orders/files] upload failed", error);
    return jsonError(error);
  }
}
