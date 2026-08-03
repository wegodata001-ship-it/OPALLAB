import { AttendanceVerificationError } from "@/lib/attendance/verification/types";
import type { GpsCaptureResult } from "@/lib/attendance/verification/types";

export const GPS_REQUIRED_MESSAGE = "יש לאשר הרשאת מיקום כדי לבצע רישום נוכחות.";

export async function captureGpsForVerification(): Promise<GpsCaptureResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new AttendanceVerificationError(GPS_REQUIRED_MESSAGE, "gps");
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
    throw new AttendanceVerificationError(GPS_REQUIRED_MESSAGE, "gps");
  }
}
