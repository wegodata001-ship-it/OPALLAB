import { AttendanceVerificationError } from "@/lib/attendance/verification/types";
import type { GpsCaptureResult } from "@/lib/attendance/verification/types";

export async function captureGpsForVerification(): Promise<GpsCaptureResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new AttendanceVerificationError(
      "לא ניתן לבצע רישום נוכחות\nיש לאפשר גישה למיקום.",
      "gps",
    );
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      capturedAt: new Date(position.timestamp),
    };
  } catch {
    throw new AttendanceVerificationError(
      "לא ניתן לבצע רישום נוכחות\nיש לאפשר גישה למיקום.",
      "gps",
    );
  }
}
