/** Legacy NFC kiosk GPS — thin wrapper over verification module. */
import { captureDeviceInfo, captureGpsForVerification } from "@/lib/attendance/verification";

export interface GpsCapture {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  deviceInfo?: string;
  timestamp?: Date;
}

/** Optional GPS for NFC kiosk (non-blocking). */
export async function captureGpsOptional(): Promise<GpsCapture> {
  try {
    const gps = await captureGpsForVerification();
    const device = captureDeviceInfo();
    return {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: gps.accuracy,
      deviceInfo: device.userAgent.slice(0, 240),
      timestamp: gps.capturedAt,
    };
  } catch {
    const device = captureDeviceInfo();
    return { deviceInfo: device.userAgent.slice(0, 240) };
  }
}
