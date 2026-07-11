import { LAB_INFO } from "@/lib/constants/labels";

export type AttendanceVerificationKind = "check-in" | "check-out";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "opal-lab";
}

export function buildAttendancePhotoFileName(kind: AttendanceVerificationKind, createdAt: Date): string {
  const y = createdAt.getFullYear();
  const m = String(createdAt.getMonth() + 1).padStart(2, "0");
  const d = String(createdAt.getDate()).padStart(2, "0");
  const hh = String(createdAt.getHours()).padStart(2, "0");
  const mm = String(createdAt.getMinutes()).padStart(2, "0");
  const ss = String(createdAt.getSeconds()).padStart(2, "0");
  return `${kind}-${y}${m}${d}-${hh}${mm}${ss}.jpg`;
}

export function buildAttendancePhotoPath(userId: string, kind: AttendanceVerificationKind, createdAt: Date): string {
  const business = slugify(LAB_INFO.businessId || "opal-lab");
  const y = createdAt.getFullYear();
  const m = String(createdAt.getMonth() + 1).padStart(2, "0");
  const d = String(createdAt.getDate()).padStart(2, "0");
  const fileName = buildAttendancePhotoFileName(kind, createdAt);
  return `attendance/${business}/${userId}/${y}/${m}/${d}/${fileName}`;
}
