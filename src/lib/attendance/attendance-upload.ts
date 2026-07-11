export interface AttendanceUploadResult {
  photoUrl: string | null;
  photoPath: string;
  fileName: string;
}

export async function uploadAttendancePhoto(file: Blob, userId: string, kind: "check-in" | "check-out"): Promise<AttendanceUploadResult> {
  const formData = new FormData();
  formData.append("photo", file, `${kind}.jpg`);
  formData.append("kind", kind);
  formData.append("userId", userId);

  const response = await fetch("/api/attendance/verification", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as { success?: boolean; data?: AttendanceUploadResult; error?: { message?: string } };
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || "שגיאה בהעלאת התמונה");
  }

  return payload.data;
}
