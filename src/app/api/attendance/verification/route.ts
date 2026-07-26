import { NextResponse } from "next/server";
import { requireSessionUserId } from "@/lib/auth/session";
import { buildAttendancePhotoPath } from "@/lib/attendance/verification/storage";
import { getSignedUrl, uploadFile } from "@/lib/supabase/storage";
import { STORAGE_BUCKETS } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors/app-error";

export async function POST(req: Request) {
  try {
    const userId = await requireSessionUserId();
    const formData = await req.formData();
    const file = formData.get("photo");
    const kind = formData.get("kind");
    const payloadUserId = formData.get("userId");

    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "הקובץ לא התקבל", 400);
    }
    if (typeof kind !== "string" || !["check-in", "check-out"].includes(kind)) {
      throw new AppError("VALIDATION_ERROR", "סוג התמונה לא תקין", 400);
    }
    if (typeof payloadUserId !== "string" || payloadUserId !== userId) {
      throw new AppError("UNAUTHORIZED", "אין הרשאה", 403);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const createdAt = new Date();
    const { storagePath, fileName } = buildAttendancePhotoPath(
      userId,
      kind as "check-in" | "check-out",
      createdAt,
    );

    await uploadFile(STORAGE_BUCKETS.USERS, storagePath, bytes, file.type || "image/jpeg");
    // Bucket `users` is private — never return a public object URL.
    const photoUrl = await getSignedUrl(STORAGE_BUCKETS.USERS, storagePath, 60 * 60);
    if (!photoUrl) {
      throw new AppError("STORAGE_ERROR", "יצירת קישור מאובטח לתמונה נכשלה", 500);
    }

    return NextResponse.json({
      success: true,
      data: {
        photoUrl,
        photoPath: storagePath,
        fileName,
      },
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError("STORAGE_ERROR", "שגיאה בהעלאת התמונה", 500, error);
    return NextResponse.json({ success: false, error: { message: appError.message } }, { status: appError.status });
  }
}
