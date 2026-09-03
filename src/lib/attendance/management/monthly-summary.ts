import { jerusalemDateKey, zonedJerusalemDate } from "@/lib/attendance/management/edit-time";
import {
  formatDurationFromHours,
  getAttendanceStatus,
} from "@/lib/attendance/management/attendance-status";
import type { AttendanceEmployeeStats, AttendanceManagementRecord } from "./types";

export type MonthDayRow = {
  dateKey: string;
  record: AttendanceManagementRecord | null;
};

/** Jerusalem calendar year/month for a given instant. */
export function jerusalemYearMonth(date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 0);
  return { year, month };
}

/** Full calendar month as YYYY-MM-DD bounds (inclusive). */
export function monthCalendarBounds(
  year: number,
  month: number,
): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function formatMonthYearLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("he-IL", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(new Date(year, month - 1, 1));
}

export function formatWeekdayJerusalem(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

/** Hours as HH:mm (e.g. 06:54). */
export function formatHoursMinutes(hours: number | null | undefined): string {
  return formatDurationFromHours(hours);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** All YYYY-MM-DD keys for a calendar month, ascending. */
export function generateMonthDayKeys(year: number, month: number): string[] {
  const count = daysInMonth(year, month);
  const keys: string[] = [];
  for (let day = 1; day <= count; day++) {
    keys.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return keys;
}

/** Noon Jerusalem on a calendar day — stable weekday formatting. */
export function dateKeyToJerusalemDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return zonedJerusalemDate(y, m, d, 12, 0);
}

/** Map attendance records to every day in the month (UI rows only). */
export function buildMonthRows(
  records: AttendanceManagementRecord[],
  year: number,
  month: number,
): MonthDayRow[] {
  const dayKeys = generateMonthDayKeys(year, month);
  const keySet = new Set(dayKeys);
  const byDay = new Map<string, AttendanceManagementRecord>();

  const sorted = [...records].sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
  for (const record of sorted) {
    const key = jerusalemDateKey(record.checkIn);
    if (keySet.has(key)) byDay.set(key, record);
  }

  return dayKeys.map((dateKey) => ({
    dateKey,
    record: byDay.get(dateKey) ?? null,
  }));
}

export function rowOvertimeHours(record: AttendanceManagementRecord): number {
  if (!record.isOvertime || record.durationHours == null) return 0;
  return Math.round(Math.max(0, record.durationHours - 9) * 100) / 100;
}

export function rowOvertimeDisplay(record: AttendanceManagementRecord): string {
  if (!record.checkOut) return "—";
  return formatHoursMinutes(rowOvertimeHours(record));
}

export function attendanceRowStatus(record: AttendanceManagementRecord): string {
  const label = getAttendanceStatus(record).label;
  if (record.method === "MANUAL" && record.checkOut) {
    return `${label} · ידני`;
  }
  return label;
}

/** Same aggregation as getEmployeeAttendanceStats — from enriched records. */
export function computeStatsFromRecords(
  records: AttendanceManagementRecord[],
): AttendanceEmployeeStats {
  const workDayKeys = new Set(
    records.map((r) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(r.checkIn),
    ),
  );
  const totalHours = records.reduce((sum, r) => sum + (r.durationHours ?? 0), 0);
  const overtimeHours = records
    .filter((r) => r.isOvertime)
    .reduce((sum, r) => sum + Math.max(0, (r.durationHours ?? 0) - 9), 0);

  return {
    workDays: workDayKeys.size,
    totalHours: Math.round(totalHours * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
    lateCount: records.filter((r) => r.isLate).length,
    earlyLeaveCount: records.filter((r) => r.isEarlyLeave).length,
    openWithoutCheckout: records.filter((r) => !r.checkOut).length,
    missingGpsCount: records.filter((r) => r.anomalies.includes("missing_gps")).length,
    outOfGeofenceCount: records.filter((r) => r.outOfGeofence).length,
  };
}
