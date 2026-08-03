import { redirect } from "next/navigation";

/** Merged into ניהול נוכחות — keep URL for old bookmarks / QR admin links. */
export default function SystemAttendanceQrRedirectPage() {
  redirect("/attendance-management");
}
