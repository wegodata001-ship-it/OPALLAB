import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { withServerTiming } from "@/lib/api/with-timing";
import { assertCanUploadOrderFile, requireSessionUser } from "@/lib/rbac";
import { completeOrderFileUpload } from "@/lib/orders/order-file-upload";
import type { OrderFileCategory } from "@/lib/orders/order-file-taxonomy";
import type { FileType, OrderFileModelMeta } from "@/lib/types";

export const runtime = "nodejs";

function decodePngDataUrl(dataUrl: string | undefined | null): Buffer | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!m?.[1]) return null;
  try {
    const buf = Buffer.from(m[1], "base64");
    if (!buf.length || buf.length > 800_000) return null;
    return buf;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const user = await requireSessionUser();
    await assertCanUploadOrderFile(user);

    const body = await parseJsonBody<{
      orderId?: string;
      fileId?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      fileType?: FileType;
      storagePath?: string;
      notes?: string;
      category?: OrderFileCategory;
      slotKey?: string;
      versionKey?: string;
      version?: number;
      replacesId?: string | null;
      modelMeta?: OrderFileModelMeta | null;
      /** Small PNG data-URL only (preview). Mesh itself is never Base64. */
      thumbnailDataUrl?: string | null;
    }>(request);

    if (
      !body.orderId ||
      !body.fileId ||
      !body.fileName ||
      !body.storagePath ||
      !body.category ||
      !body.slotKey ||
      !body.versionKey ||
      typeof body.version !== "number" ||
      !body.fileType
    ) {
      throw new AppError("VALIDATION_ERROR", "חסרים פרטים להשלמת ההעלאה", 400);
    }

    const file = await completeOrderFileUpload({
      orderId: body.orderId,
      userId: user.id,
      fileId: body.fileId,
      fileName: body.fileName,
      fileSize: typeof body.fileSize === "number" ? body.fileSize : 0,
      mimeType: body.mimeType || "application/octet-stream",
      fileType: body.fileType,
      storagePath: body.storagePath,
      notes: body.notes,
      category: body.category,
      slotKey: body.slotKey,
      versionKey: body.versionKey,
      version: body.version,
      replacesId: body.replacesId,
      modelMeta: body.modelMeta ?? null,
      thumbnailBuffer: decodePngDataUrl(body.thumbnailDataUrl),
    });

    return withServerTiming(
      jsonOk({
        file,
        message: "הקובץ נשמר בהצלחה.",
      }),
      startedAt,
    );
  } catch (error) {
    return withServerTiming(jsonError(error), startedAt);
  }
}
