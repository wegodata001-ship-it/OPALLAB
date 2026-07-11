import type { PhotoUploadResult, VerificationKind } from "@/lib/attendance/verification/types";
import { AttendanceVerificationError } from "@/lib/attendance/verification/types";

export async function uploadVerificationPhoto(
  file: Blob,
  userId: string,
  kind: VerificationKind,
): Promise<PhotoUploadResult> {
  const formData = new FormData();
  formData.append("photo", file, "photo.jpg");
  formData.append("kind", kind);
  formData.append("userId", userId);

  const response = await fetch("/api/attendance/verification", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: PhotoUploadResult;
    error?: { message?: string };
  };

  if (!response.ok || !payload.success || !payload.data) {
    throw new AttendanceVerificationError(
      payload.error?.message || "העלאת התמונה נכשלה",
      "uploading",
    );
  }

  return payload.data;
}
