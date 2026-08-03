export type VerificationKind = "check-in" | "check-out";

export type VerificationStep = "gps" | "saving" | "done" | "error";

export const VERIFICATION_STEP_MESSAGES: Record<VerificationStep, string> = {
  gps: "מבקש גישה למיקום...",
  saving: "שומר נוכחות...",
  done: "מסיים...",
  error: "שגיאה",
};

export interface GpsCaptureResult {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: Date;
}

export interface DeviceCaptureResult {
  browser: string;
  os: string;
  deviceType: string;
  userAgent: string;
  screenSize: string;
  timezone: string;
}

export interface AttendanceVerificationPayload {
  latitude: number;
  longitude: number;
  accuracy?: number;
  device: DeviceCaptureResult;
}

export class AttendanceVerificationError extends Error {
  constructor(
    message: string,
    public readonly step: VerificationStep,
  ) {
    super(message);
    this.name = "AttendanceVerificationError";
  }
}
