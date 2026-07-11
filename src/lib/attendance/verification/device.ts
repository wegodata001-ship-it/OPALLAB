import type { DeviceCaptureResult } from "@/lib/attendance/verification/types";

function detectBrowser(ua: string): string {
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  return "Unknown";
}

function detectOs(ua: string): string {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}

function detectDeviceType(ua: string): string {
  if (/Mobi|Android/i.test(ua)) return "Mobile";
  if (/Tablet|iPad/i.test(ua)) return "Tablet";
  return "Desktop";
}

export function captureDeviceInfo(): DeviceCaptureResult {
  if (typeof navigator === "undefined") {
    return {
      browser: "Unknown",
      os: "Unknown",
      deviceType: "Unknown",
      userAgent: "",
      screenSize: "",
      timezone: "",
    };
  }

  const ua = navigator.userAgent;
  return {
    browser: detectBrowser(ua),
    os: detectOs(ua),
    deviceType: detectDeviceType(ua),
    userAgent: ua.slice(0, 500),
    screenSize: typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
