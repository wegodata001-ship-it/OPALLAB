/** Client-side GPS capture for attendance (non-blocking). */
export interface GpsCapture {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  deviceInfo?: string;
}

export function getDeviceInfo(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.userAgent.slice(0, 240);
}

export async function captureGps(): Promise<GpsCapture> {
  const deviceInfo = getDeviceInfo();
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { deviceInfo };
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
      deviceInfo,
    };
  } catch {
    return { deviceInfo };
  }
}
