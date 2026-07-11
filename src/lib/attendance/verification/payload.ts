import type {
  AttendanceVerificationPayload,
  DeviceCaptureResult,
  GpsCaptureResult,
  PhotoUploadResult,
} from "@/lib/attendance/verification/types";

export function buildVerificationPayload(
  gps: GpsCaptureResult,
  photo: PhotoUploadResult,
  device: DeviceCaptureResult,
): AttendanceVerificationPayload {
  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
    accuracy: gps.accuracy,
    photoUrl: photo.photoUrl,
    photoPath: photo.photoPath,
    fileName: photo.fileName,
    device,
  };
}

/** Maps verification payload to attendance service meta (server enriches address). */
export function toAttendanceMeta(payload: AttendanceVerificationPayload) {
  return {
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: payload.accuracy,
    photoUrl: payload.photoUrl,
    photoPath: payload.photoPath,
    fileName: payload.fileName,
    device: payload.device,
  };
}
