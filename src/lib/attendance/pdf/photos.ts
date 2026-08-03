import sharp from "sharp";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";

const MAX_PHOTO_EMBEDS = 80;
const THUMB_SIZE = 36;
const FETCH_TIMEOUT_MS = 2500;

export type AttendancePhotoThumbs = Map<
  string,
  { checkIn?: string; checkOut?: string }
>;

async function fetchThumbDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input)
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
      .jpeg({ quality: 70 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Load small thumbnails for PDF embedding (capped for performance). */
export async function loadAttendancePhotoThumbs(
  records: AttendanceManagementRecord[],
  enabled: boolean,
): Promise<AttendancePhotoThumbs> {
  const result: AttendancePhotoThumbs = new Map();
  if (!enabled) return result;

  type Job = { recordId: string; kind: "checkIn" | "checkOut"; url: string };
  const jobs: Job[] = [];

  for (const r of records) {
    if (r.checkInPhotoUrl) {
      jobs.push({ recordId: r.id, kind: "checkIn", url: r.checkInPhotoUrl });
    }
    if (r.checkOutPhotoUrl) {
      jobs.push({ recordId: r.id, kind: "checkOut", url: r.checkOutPhotoUrl });
    }
  }

  const limited = jobs.slice(0, MAX_PHOTO_EMBEDS);
  const concurrency = 8;
  let index = 0;

  async function worker() {
    while (index < limited.length) {
      const job = limited[index++]!;
      const dataUrl = await fetchThumbDataUrl(job.url);
      if (!dataUrl) continue;
      const entry = result.get(job.recordId) ?? {};
      if (job.kind === "checkIn") entry.checkIn = dataUrl;
      else entry.checkOut = dataUrl;
      result.set(job.recordId, entry);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}

export function recordsHavePhotos(records: AttendanceManagementRecord[]): boolean {
  return records.some((r) => Boolean(r.checkInPhotoUrl || r.checkOutPhotoUrl));
}
