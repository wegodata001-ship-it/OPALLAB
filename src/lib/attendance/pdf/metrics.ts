import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";

const TZ = "Asia/Jerusalem";
const STANDARD_DAILY_HOURS = 8;

export type AttendanceReportKpis = {
  totalHours: number;
  checkIns: number;
  checkOuts: number;
  overtimeHours: number;
  lateCount: number;
  workDays: number;
  missingDays: number | null;
};

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

function isIsraelWorkday(date: Date): boolean {
  // Sunday–Thursday
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(date);
  return weekday !== "Fri" && weekday !== "Sat";
}

function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setHours(12, 0, 0, 0);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function computeAttendanceReportKpis(
  records: AttendanceManagementRecord[],
  opts: { from?: string; to?: string; personal?: boolean },
): AttendanceReportKpis {
  const workDayKeys = new Set(records.map((r) => dateKey(r.checkIn)));
  const dailyHours = new Map<string, number>();
  let totalHours = 0;
  let checkOuts = 0;
  let lateCount = 0;

  for (const r of records) {
    if (r.isLate) lateCount += 1;
    if (r.checkOut) checkOuts += 1;
    if (r.durationHours == null) continue;
    totalHours += r.durationHours;
    const key = dateKey(r.checkIn);
    dailyHours.set(key, (dailyHours.get(key) ?? 0) + r.durationHours);
  }

  let overtimeHours = 0;
  for (const hours of dailyHours.values()) {
    overtimeHours += Math.max(0, hours - STANDARD_DAILY_HOURS);
  }

  let missingDays: number | null = null;
  if (opts.personal && opts.from && opts.to) {
    const from = new Date(opts.from);
    const to = new Date(opts.to);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      const expected = eachDay(from, to).filter(isIsraelWorkday).map(dateKey);
      missingDays = expected.filter((d) => !workDayKeys.has(d)).length;
    }
  }

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    checkIns: records.length,
    checkOuts,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    lateCount,
    workDays: workDayKeys.size,
    missingDays,
  };
}
