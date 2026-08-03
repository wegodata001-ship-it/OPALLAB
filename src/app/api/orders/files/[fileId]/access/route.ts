import { jsonError, jsonOk } from "@/lib/api/response";
import { requireSessionUser } from "@/lib/rbac";
import { getAccessibleOrderFile } from "@/lib/orders/assert-order-file-access";
import { getSignedUrl, STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { metaFromUnknown } from "@/lib/orders/model-meta";

export const runtime = "nodejs";

/**
 * Fast access for 3D viewer: cheap ACL + signed Storage URL (no byte proxy, no Base64).
 * Target: API < 150ms.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const t0 = performance.now();
  try {
    const user = await requireSessionUser();
    const { fileId } = await context.params;
    const file = await getAccessibleOrderFile(user, fileId);

    if (!file.storagePath) {
      return jsonError(new Error("אין נתיב Storage לקובץ"));
    }

    const signedUrl = await getSignedUrl(
      STORAGE_BUCKETS.ORDER_FILES,
      file.storagePath,
      60 * 30,
    );
    if (!signedUrl) {
      return jsonError(new Error("יצירת Signed URL נכשלה"));
    }

    let thumbnailUrl: string | null = null;
    if (file.thumbnailPath) {
      thumbnailUrl = await getSignedUrl(
        STORAGE_BUCKETS.ORDER_FILES,
        file.thumbnailPath,
        60 * 60,
      );
    }

    const apiMs = Math.round(performance.now() - t0);
    return jsonOk({
      fileId: file.id,
      orderId: file.orderId,
      fileName: file.fileName,
      fileSize: file.fileSize ?? 0,
      mimeType: file.mimeType,
      signedUrl,
      thumbnailUrl,
      modelMeta: metaFromUnknown(file.modelMeta),
      parsedAt: file.parsedAt,
      timings: { apiMs },
    });
  } catch (error) {
    return jsonError(error);
  }
}
