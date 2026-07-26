import { getSignedUrl, STORAGE_BUCKETS } from "@/lib/supabase/storage";

/**
 * Extract storage object path from a stored attendance photo URL or raw path.
 * Handles public / sign / authenticated Supabase URL shapes used historically.
 */
export function extractAttendanceStoragePath(
  urlOrPath: string | null | undefined,
): string | null {
  if (!urlOrPath?.trim()) return null;
  const value = urlOrPath.trim();

  // Already a storage path (not a full URL)
  if (!value.includes("://") && !value.startsWith("data:")) {
    return value.replace(/^\/+/, "");
  }

  if (value.startsWith("data:")) return null;

  const bucket = STORAGE_BUCKETS.USERS;
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/authenticated/${bucket}/`,
  ];

  for (const marker of markers) {
    const idx = value.indexOf(marker);
    if (idx >= 0) {
      const rest = value.slice(idx + marker.length);
      return decodeURIComponent(rest.split("?")[0] || "");
    }
  }

  return null;
}

/**
 * Resolve a displayable attendance photo URL.
 * Prefers Signed URL from photoPath (private `users` bucket).
 */
export async function resolveAttendancePhotoUrl(
  photoPath?: string | null,
  photoUrl?: string | null,
): Promise<string | null> {
  const path = photoPath?.trim() || extractAttendanceStoragePath(photoUrl);
  if (path) {
    const signed = await getSignedUrl(STORAGE_BUCKETS.USERS, path, 60 * 60);
    if (signed) return signed;
  }

  // data URLs (legacy / local) still work as-is
  if (photoUrl?.startsWith("data:")) return photoUrl;

  // Already a signed URL with token — may still work until expiry
  if (photoUrl && photoUrl.includes("token=")) return photoUrl;

  return null;
}

export async function withSignedAttendancePhotos<
  T extends {
    checkInPhotoUrl?: string | null;
    checkOutPhotoUrl?: string | null;
    checkInPhotoPath?: string | null;
    checkOutPhotoPath?: string | null;
  },
>(record: T): Promise<T> {
  const [checkInPhotoUrl, checkOutPhotoUrl] = await Promise.all([
    resolveAttendancePhotoUrl(record.checkInPhotoPath, record.checkInPhotoUrl),
    resolveAttendancePhotoUrl(record.checkOutPhotoPath, record.checkOutPhotoUrl),
  ]);
  return {
    ...record,
    checkInPhotoUrl,
    checkOutPhotoUrl,
  };
}
