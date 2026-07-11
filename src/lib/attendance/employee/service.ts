import { prisma } from "@/lib/prisma";
import type {
  EmployeeAttendanceQuery,
  EmployeeAttendanceRecordRow,
  EmployeeAttendanceResult,
  EmployeeAttendanceSummary,
} from "@/lib/attendance/employee/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const STANDARD_DAILY_HOURS = 8;
const TZ = "Asia/Jerusalem";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function resolveBounds(query: EmployeeAttendanceQuery): { start: Date; end: Date } {
  const now = new Date();
  if (query.month != null && query.year != null) {
    const start = new Date(query.year, query.month - 1, 1);
    const end = endOfDay(new Date(query.year, query.month, 0));
    return { start, end };
  }
  const start = query.from ? startOfDay(new Date(query.from)) : startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = query.to ? endOfDay(new Date(query.to)) : endOfDay(now);
  return { start, end };
}

function weekdayHe(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: TZ }).format(date);
}

function dateKeyJerusalem(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

function mapRow(record: { id: string; checkIn: Date; checkOut: Date | null }): EmployeeAttendanceRecordRow {
  const durationHours = record.checkOut
    ? (record.checkOut.getTime() - record.checkIn.getTime()) / 3_600_000
    : null;
  return {
    id: record.id,
    checkIn: record.checkIn,
    checkOut: record.checkOut,
    durationHours,
    status: record.checkOut ? "closed" : "open",
    weekday: weekdayHe(record.checkIn),
  };
}

function computeSummary(
  records: { checkIn: Date; checkOut: Date | null }[],
): EmployeeAttendanceSummary {
  const workDayKeys = new Set<string>();
  const dailyHours = new Map<string, number>();
  let totalHours = 0;

  for (const record of records) {
    workDayKeys.add(dateKeyJerusalem(record.checkIn));
    if (!record.checkOut) continue;
    const hours = (record.checkOut.getTime() - record.checkIn.getTime()) / 3_600_000;
    totalHours += hours;
    const key = dateKeyJerusalem(record.checkIn);
    dailyHours.set(key, (dailyHours.get(key) ?? 0) + hours);
  }

  let overtimeHours = 0;
  for (const hours of dailyHours.values()) {
    overtimeHours += Math.max(0, hours - STANDARD_DAILY_HOURS);
  }

  const workDays = workDayKeys.size;
  const averageHoursPerDay = workDays > 0 ? totalHours / workDays : 0;

  return {
    workDays,
    totalHours: Math.round(totalHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    averageHoursPerDay: Math.round(averageHoursPerDay * 100) / 100,
  };
}

export async function getEmployeeAttendance(
  userId: string,
  query: EmployeeAttendanceQuery,
): Promise<EmployeeAttendanceResult> {
  const { start, end } = resolveBounds(query);
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const sortDir = query.sortDir === "asc" ? "asc" : "desc";

  const where = {
    userId,
    checkIn: { gte: start, lte: end },
  };

  const [allForSummary, total, pageRecords, openRecord] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      select: { checkIn: true, checkOut: true },
      orderBy: { checkIn: "desc" },
    }),
    prisma.attendanceRecord.count({ where }),
    prisma.attendanceRecord.findMany({
      where,
      select: { id: true, checkIn: true, checkOut: true },
      orderBy: { checkIn: sortDir },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.attendanceRecord.findFirst({
      where: { userId, checkOut: null },
      select: { id: true, checkIn: true },
      orderBy: { checkIn: "desc" },
    }),
  ]);

  const summary = computeSummary(allForSummary);

  return {
    records: pageRecords.map(mapRow),
    summary,
    openRecord,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}