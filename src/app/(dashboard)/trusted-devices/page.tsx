import { redirect } from "next/navigation";

/** Merged into ניהול נוכחות — keep URL for old bookmarks. */
export default function TrustedDevicesRedirectPage() {
  redirect("/attendance-management");
}
