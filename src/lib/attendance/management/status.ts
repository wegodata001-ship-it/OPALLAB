import { distanceMeters } from "@/lib/attendance/gate/geofence";
import type { AttendanceLabGeo } from "@/lib/attendance/management/types";
import type {
  AttendanceAnomalyCode,
  AttendanceComplianceStatus,
} from "@/lib/attendance/management/types";

const STANDARD_DAY_HOURS = 9;
const OVERTIME_HOURS = 9;
const EARLY_LEAVE_HOUR = 16; // Asia/Jerusalem

function jerusalemHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? 0),
  };
}

export function isEarlyLeaveCheckOut(checkOut: Date): boolean {
  const { hour } = jerusalemHourMinute(checkOut);
  return hour < EARLY_LEAVE_HOUR;
}

export function detectAttendanceAnomalies(input: {
  checkOut: Date | null | undefined;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  checkInAccuracy?: number | null;
  isLate: boolean;
  durationHours: number | null;
  labGeo?: AttendanceLabGeo | null;
}): {
  anomalies: AttendanceAnomalyCode[];
  complianceStatus: AttendanceComplianceStatus;
  outOfGeofence: boolean;
  isEarlyLeave: boolean;
  isOvertime: boolean;
} {
  const anomalies: AttendanceAnomalyCode[] = [];
  const hasInGps = input.checkInLatitude != null && input.checkInLongitude != null;
  const hasOutGps = input.checkOutLatitude != null && input.checkOutLongitude != null;

  if (!input.checkOut) anomalies.push("missing_checkout");
  if (!hasInGps && !hasOutGps) anomalies.push("missing_gps");
  if (input.isLate) anomalies.push("late");

  let outOfGeofence = false;
  const lab = input.labGeo;
  if (
    lab?.geofenceEnabled &&
    lab.labLatitude != null &&
    lab.labLongitude != null &&
    hasInGps
  ) {
    const d = distanceMeters(
      input.checkInLatitude!,
      input.checkInLongitude!,
      lab.labLatitude,
      lab.labLongitude,
    );
    if (d > lab.geofenceRadiusMeters) {
      outOfGeofence = true;
      anomalies.push("out_of_geofence");
    }
  }

  const isOvertime =
    input.durationHours != null && input.durationHours >= OVERTIME_HOURS + 0.01;
  if (isOvertime) anomalies.push("unusual_hours");

  const isEarlyLeave = Boolean(
    input.checkOut && isEarlyLeaveCheckOut(input.checkOut) && (input.durationHours ?? 0) < STANDARD_DAY_HOURS,
  );
  if (isEarlyLeave) anomalies.push("early_leave");

  let complianceStatus: AttendanceComplianceStatus = "ok";
  if (anomalies.includes("missing_checkout") || anomalies.includes("missing_gps")) {
    complianceStatus = "missing";
  } else if (anomalies.length > 0) {
    complianceStatus = "anomaly";
  }

  return { anomalies, complianceStatus, outOfGeofence, isEarlyLeave, isOvertime };
}

export const ANOMALY_LABELS: Record<AttendanceAnomalyCode, string> = {
  missing_checkout: "חסרה יציאה",
  missing_gps: "חסר GPS",
  out_of_geofence: "מחוץ לאזור",
  late: "איחור",
  unusual_hours: "שעות חריגות",
  early_leave: "יציאה מוקדמת",
};

export function methodChannelLabel(method: string, nfcTagId?: string | null): string {
  if (method === "TRUSTED_DEVICE") return "QR / מכשיר מאושר";
  if (method === "NFC" || nfcTagId) return "NFC";
  if (method === "GPS") return "GPS";
  if (method === "MANUAL") return "ידני";
  return method;
}
