import { formatDate, formatTime } from "@/lib/utils";
import type { AttendanceEmployeeStats, AttendanceManagementRecord } from "./types";
import {
  attendanceRowStatus,
  buildMonthRows,
  computeStatsFromRecords,
  dateKeyToJerusalemDate,
  formatHoursMinutes,
  formatMonthYearLabel,
  formatWeekdayJerusalem,
  rowOvertimeDisplay,
} from "./monthly-summary";

export type MonthlyHoursReportRow = {
  dateKey: string;
  dateDisplay: string;
  weekday: string;
  checkIn: string;
  checkOut: string;
  workHours: string;
  overtimeHours: string;
  status: string;
  source: string;
};

export type MonthlyHoursReportData = {
  employeeName: string;
  year: number;
  month: number;
  monthLabel: string;
  generatedAt: Date;
  summary: AttendanceEmployeeStats;
  rows: MonthlyHoursReportRow[];
};

export function reportRowStatus(record: AttendanceManagementRecord | null): string {
  if (!record) return "אין נוכחות";
  return attendanceRowStatus(record);
}

export function reportRowSource(record: AttendanceManagementRecord | null): string {
  if (!record) return "—";
  return record.channelLabel || "—";
}

function mapReportRow(dateKey: string, record: AttendanceManagementRecord | null): MonthlyHoursReportRow {
  const dayDate = dateKeyToJerusalemDate(dateKey);
  return {
    dateKey,
    dateDisplay: formatDate(dayDate),
    weekday: formatWeekdayJerusalem(dayDate),
    checkIn: record ? formatTime(record.checkIn) : "—",
    checkOut: record?.checkOut ? formatTime(record.checkOut) : "—",
    workHours: record ? formatHoursMinutes(record.durationHours) : "—",
    overtimeHours: record ? rowOvertimeDisplay(record) : "—",
    status: reportRowStatus(record),
    source: reportRowSource(record),
  };
}

/** Single source of truth for monthly hours UI + PDF + Excel. */
export function buildMonthlyHoursReportData(input: {
  records: AttendanceManagementRecord[];
  year: number;
  month: number;
  employeeName: string;
  generatedAt?: Date;
}): MonthlyHoursReportData {
  const monthRows = buildMonthRows(input.records, input.year, input.month);
  return {
    employeeName: input.employeeName,
    year: input.year,
    month: input.month,
    monthLabel: formatMonthYearLabel(input.year, input.month),
    generatedAt: input.generatedAt ?? new Date(),
    summary: computeStatsFromRecords(input.records),
    rows: monthRows.map(({ dateKey, record }) => mapReportRow(dateKey, record)),
  };
}

export function slugifyEmployeeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "employee";
  return trimmed
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "employee";
}

export function monthlyHoursReportFilename(
  employeeName: string,
  year: number,
  month: number,
  ext: "pdf" | "xlsx",
): string {
  const slug = slugifyEmployeeName(employeeName);
  const mm = String(month).padStart(2, "0");
  return `attendance-${slug}-${year}-${mm}.${ext}`;
}
