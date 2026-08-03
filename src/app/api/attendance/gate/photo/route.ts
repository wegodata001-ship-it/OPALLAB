import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { buildAttendancePhotoPath } from "@/lib/attendance/verification/storage";
import { getSignedUrl, uploadFile } from "@/lib/supabase/storage";
import { STORAGE_BUCKETS } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Upload attendance selfie via trusted device key (no login session required). */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") ?? formData.get("photo");
    const deviceKey = formData.get("deviceKey");
    const kind = formData.get("kind");

    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "הקובץ לא התקבל", 400);
    }
    if (typeof deviceKey !== "string" || deviceKey.length < 16) {
      throw new AppError("VALIDATION_ERROR", "מזהה מכשיר חסר", 400);
    }
    if (typeof kind !== "string" || (kind !== "check-in" && kind !== "check-out")) {
      throw new AppError("VALIDATION_ERROR", "סוג התמונה לא תקין", 400);
    }

    const device = await prisma.trustedDevice.findUnique({
      where: { deviceKey },
      include: { user: { select: { id: true, isActive: true } } },
    });
    if (!device || device.status !== "ACTIVE" || !device.user.isActive) {
      throw new AppError("FORBIDDEN", "המכשיר אינו מאושר להעלאת תמונה", 403, {
        code: "DEVICE_UNKNOWN",
      });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const createdAt = new Date();
    // Unique path so multiple punches same day don't overwrite.
    const { storagePath, fileName } = buildAttendancePhotoPath(
      device.userId,
      kind,
      createdAt,
    );
    const uniquePath = storagePath.replace(
      /photo\.jpg$/,
      `photo-${createdAt.getTime()}.jpg`,
    );

    await uploadFile(STORAGE_BUCKETS.USERS, uniquePath, bytes, file.type || "image/jpeg");
    const photoUrl = await getSignedUrl(STORAGE_BUCKETS.USERS, uniquePath, 60 * 60);
    if (!photoUrl) {
      throw new AppError("STORAGE_ERROR", "יצירת קישור מאובטח לתמונה נכשלה", 500);
    }

    return jsonOk({
      photoUrl,
      photoPath: uniquePath,
      fileName,
      userId: device.userId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
