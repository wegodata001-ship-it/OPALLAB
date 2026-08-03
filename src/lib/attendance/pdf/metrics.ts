import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";

const TZ = "Asia/Jerusalem";
/** Standard day for overtime — aligned with management (9h). */
const STANDARD_DAILY_HOURS = 9;

export type AttendanceReportKpis = {
  totalHours: number;
  checkIns: number;
  checkOuts: number;
  overtimeHours: number;
  lateCount: number;
  earlyLeaveCount: number;
  workDays: number;
  avgHoursPerDay: number;
  missingDays: number | null;
};

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

function isIsraelWorkday(date: Date): boolean {
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

function hourInIsrael(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
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
  let earlyLeaveCount = 0;

  for (const r of records) {
    if (r.isLate) lateCount += 1;
    if (r.checkOut) {
      checkOuts += 1;
      const hours = r.durationHours ?? 0;
      if (hourInIsrael(r.checkOut) < 16 && hours < STANDARD_DAILY_HOURS) {
        earlyLeaveCount += 1;
      }
    }
    if (r.durationHours == null) continue;
    totalHours += r.durationHours;
    const key = dateKey(r.checkIn);
    dailyHours.set(key, (dailyHours.get(key) ?? 0) + r.durationHours);
  }

  let overtimeHours = 0;
  for (const hours of dailyHours.values()) {
    overtimeHours += Math.max(0, hours - STANDARD_DAILY_HOURS);
  }

  const workDays = workDayKeys.size;
  const avgHoursPerDay =
    workDays > 0 ? Math.round((totalHours / workDays) * 100) / 100 : 0;

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
    earlyLeaveCount,
    workDays,
    avgHoursPerDay,
    missingDays,
  };
}
