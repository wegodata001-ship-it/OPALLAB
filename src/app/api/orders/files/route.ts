import { requireSessionUserId } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk } from "@/lib/api/response";
import { detectFileType } from "@/lib/file-utils";

const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 100) * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const userId = await requireSessionUserId();
    const formData = await request.formData();
    const orderId = formData.get("orderId");
    const file = formData.get("file");
    const notes = formData.get("notes");

    if (typeof orderId !== "string" || !orderId) {
      throw new AppError("VALIDATION_ERROR", "מזהה הזמנה חסר", 400);
    }
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "קובץ חסר", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError("UPLOAD_ERROR", `גודל הקובץ חורג מהמגבלה (${process.env.MAX_UPLOAD_SIZE_MB || 100}MB)`, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
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
    });

    return jsonOk({ file: created });
  } catch (error) {
    return jsonError(error);
  }
}
