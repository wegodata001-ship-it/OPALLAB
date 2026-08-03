import type {
  AttendanceVerificationPayload,
  DeviceCaptureResult,
  GpsCaptureResult,
} from "@/lib/attendance/verification/types";

export function buildVerificationPayload(
  gps: GpsCaptureResult,
  device: DeviceCaptureResult,
): AttendanceVerificationPayload {
  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
    accuracy: gps.accuracy,
    device,
  };
}

/** Maps verification payload to attendance service meta (server enriches address). */
export function toAttendanceMeta(payload: AttendanceVerificationPayload) {
  return {
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: payload.accuracy,
    device: payload.device,
  };
}
