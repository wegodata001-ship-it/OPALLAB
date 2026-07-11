import { LAB_INFO } from "@/lib/constants/labels";
import type { VerificationKind } from "@/lib/attendance/verification/types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "opal-lab";
}

export function buildAttendancePhotoPath(
  userId: string,
  kind: VerificationKind,
  createdAt: Date,
): { storagePath: string; fileName: string } {
  const business = slugify(LAB_INFO.businessId || "opal-lab");
  const y = createdAt.getFullYear();
  const m = String(createdAt.getMonth() + 1).padStart(2, "0");
  const d = String(createdAt.getDate()).padStart(2, "0");
  const folder = kind === "check-in" ? "check-in" : "check-out";
  const fileName = "photo.jpg";
  const storagePath = `attendance/${business}/${userId}/${y}/${m}/${d}/${folder}/${fileName}`;
  return { storagePath, fileName };
}
