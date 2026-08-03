import type { AttendanceMethod, AttendanceRecord, User, UserRole } from "@/lib/types";

export type AttendanceRecordStatus = "present" | "left" | "late" | "not_checked_in";
export type AttendanceGpsFilter = "all" | "valid" | "invalid";
export type AttendancePhotoFilter = "all" | "has" | "none";
export type AttendanceSortField = "name" | "checkIn" | "checkOut" | "duration" | "date";
export type AttendanceComplianceStatus = "ok" | "missing" | "anomaly";
export type AttendanceAnomalyCode =
  | "missing_checkout"
  | "missing_gps"
  | "missing_photo"
  | "out_of_geofence"
  | "late"
  | "unusual_hours"
  | "early_leave";

export interface AttendanceManagementQuery {
  from?: string;
  to?: string;
  userId?: string;
  role?: UserRole;
  status?: AttendanceRecordStatus;
  gps?: AttendanceGpsFilter;
  photo?: AttendancePhotoFilter;
  search?: string;
  sortBy?: AttendanceSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
  /** Filter flags */
  lateOnly?: boolean;
  overtimeOnly?: boolean;
  anomaliesOnly?: boolean;
  compliance?: AttendanceComplianceStatus;
}

export interface AttendanceEmployeeSummary {
  id: string;
  name: string;
  phone: string | null;
  role: UserRole;
  roles: UserRole[];
  color: string | null;
}

export interface AttendanceManagementRecord extends AttendanceRecord {
  employee: AttendanceEmployeeSummary;
  durationHours: number | null;
  isLate: boolean;
  gpsValid: boolean;
  hasPhoto: boolean;
  anomalies: AttendanceAnomalyCode[];
  complianceStatus: AttendanceComplianceStatus;
  outOfGeofence: boolean;
  isEarlyLeave: boolean;
  isOvertime: boolean;
  channelLabel: string;
}

export interface AttendanceEmployeeStats {
  workDays: number;
  totalHours: number;
  overtimeHours: number;
  lateCount: number;
  earlyLeaveCount: number;
  openWithoutCheckout: number;
  missingGpsCount: number;
  missingPhotoCount: number;
  outOfGeofenceCount: number;
}

export interface AttendanceActiveRecord extends AttendanceManagementRecord {
  liveDurationMs: number;
}

export interface AttendanceManagementKpis {
  presentNow: number;
  finishedToday: number;
  notCheckedInToday: number;
  lateToday: number;
  hoursToday: number;
  hoursMonth: number;
  avgHoursPerEmployee: number;
}

export type TrustedDeviceStatusLabel = "NONE" | "ACTIVE" | "BLOCKED" | "REVOKED";

export interface AttendanceEmployeeRosterRow {
  employee: AttendanceEmployeeSummary;
  deviceId: string | null;
  deviceStatus: TrustedDeviceStatusLabel;
  deviceLabel: string | null;
  deviceOs: string | null;
  deviceBrowser: string | null;
  deviceType: string | null;
  lastCheckIn: string | null;
  lastCheckOut: string | null;
  isPresent: boolean;
}

export interface AttendanceLabGeo {
  labLatitude: number | null;
  labLongitude: number | null;
  geofenceRadiusMeters: number;
  geofenceEnabled: boolean;
}

export interface AttendanceManagementRecordsResult {
  records: AttendanceManagementRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AttendanceNotCheckedInRow {
  id: string;
  employee: AttendanceEmployeeSummary;
  status: "not_checked_in";
}
