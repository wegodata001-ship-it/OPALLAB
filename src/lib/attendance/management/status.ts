import { distanceMeters } from "@/lib/attendance/gate/geofence";
import {
  complianceStatusFromLevel,
  getAttendanceStatus,
  isEarlyLeaveCheckOut,
  isLateCheckIn,
} from "@/lib/attendance/management/attendance-status";
import type { AttendanceLabGeo } from "@/lib/attendance/management/types";
import type {
  AttendanceAnomalyCode,
  AttendanceComplianceStatus,
} from "@/lib/attendance/management/types";

const OVERTIME_HOURS = 9;

export { isLateCheckIn, isEarlyLeaveCheckOut } from "@/lib/attendance/management/attendance-status";

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
  checkIn: Date;
  outOfGeofenceSeed?: boolean;
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

  const isEarlyLeave = Boolean(
    input.checkOut && isEarlyLeaveCheckOut(input.checkOut),
  );
  if (isEarlyLeave) anomalies.push("early_leave");

  const status = getAttendanceStatus({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    checkInLatitude: input.checkInLatitude,
    checkInLongitude: input.checkInLongitude,
    latitude: input.checkInLatitude,
    longitude: input.checkInLongitude,
    outOfGeofence,
    anomalies,
  });

  const complianceStatus = complianceStatusFromLevel(
    status.level,
    anomalies.includes("missing_gps"),
  );

  return { anomalies, complianceStatus, outOfGeofence, isEarlyLeave, isOvertime };
}

export const ANOMALY_LABELS: Record<AttendanceAnomalyCode, string> = {
  missing_checkout: "חסרה יציאה",
  missing_gps: "חסר GPS",
  out_of_geofence: "מחוץ לאזור",
  late: "איחור",
  unusual_hours: "שעות נוספות",
  early_leave: "יציאה מוקדמת",
};

export function methodChannelLabel(method: string, nfcTagId?: string | null): string {
  if (method === "TRUSTED_DEVICE") return "QR / מכשיר מאושר";
  if (method === "NFC" || nfcTagId) return "NFC";
  if (method === "GPS") return "GPS";
  if (method === "MANUAL") return "ידני";
  return method;
}
