import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapAttendance } from "@/lib/mappers/prisma-to-app";
import type { UserRole } from "@/lib/types";
import type {
  AttendanceActiveRecord,
  AttendanceEmployeeSummary,
  AttendanceManagementKpis,
  AttendanceManagementQuery,
  AttendanceManagementRecord,
  AttendanceManagementRecordsResult,
  AttendanceNotCheckedInRow,
} from "@/lib/attendance/management/types";

const LATE_HOUR = 9;
const GPS_MAX_ACCURACY = 100;
const DEFAULT_LIMIT = 25;
const MAX_EXPORT = 10_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function todayBounds(): { start: Date; end: Date } {
  const now = new Date();
  return { start: startOfDay(now), end: endOfDay(now) };
}

function monthBounds(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: endOfDay(now),
  };
}

export function isLateCheckIn(checkIn: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(checkIn);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour > LATE_HOUR || (hour === LATE_HOUR && minute > 0);
}

export function isGpsValid(
  lat?: number | null,
  lng?: number | null,
  accuracy?: number | null,
): boolean {
  if (lat == null || lng == null) return false;
  if (accuracy == null) return true;
  return accuracy <= GPS_MAX_ACCURACY;
}

function mapEmployee(user: {
  id: string;
  name: string;
  phone: string | null;
  role: UserRole;
  roles: UserRole[];
  color: string | null;
}): AttendanceEmployeeSummary {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    roles: user.roles?.length ? user.roles : [user.role],
    color: user.color,
  };
}

function enrichRecord(
  record: ReturnType<typeof mapAttendance>,
  user: Parameters<typeof mapEmployee>[0],
): AttendanceManagementRecord {
  const end = record.checkOut ?? new Date();
  const durationHours = (end.getTime() - record.checkIn.getTime()) / 3_600_000;
  const lat = record.checkInLatitude ?? record.latitude;
  const lng = record.checkInLongitude ?? record.longitude;
  return {
    ...record,
    employee: mapEmployee(user),
    durationHours: record.checkOut ? durationHours : null,
    isLate: isLateCheckIn(record.checkIn),
    gpsValid: isGpsValid(lat, lng, record.checkInAccuracy),
    hasPhoto: Boolean(record.checkInPhotoUrl || record.checkOutPhotoUrl),
  };
}

function employeeWhere(query: AttendanceManagementQuery): Prisma.UserWhereInput {
  const search = query.search?.trim();
  return {
    role: { not: "DOCTOR" },
    isActive: true,
    ...(query.userId ? { id: query.userId } : {}),
    ...(query.role
      ? { OR: [{ role: query.role }, { roles: { has: query.role } }] }
      : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function recordDateWhere(query: AttendanceManagementQuery): Prisma.AttendanceRecordWhereInput {
  const from = query.from ? startOfDay(new Date(query.from)) : undefined;
  const to = query.to ? endOfDay(new Date(query.to)) : undefined;
  return {
    ...(from || to
      ? {
          checkIn: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };
}

async function lateRecordIds(
  query: AttendanceManagementQuery,
  extra?: Prisma.AttendanceRecordWhereInput,
): Promise<string[] | null> {
  if (query.status !== "late") return null;

  const from = query.from ? startOfDay(new Date(query.from)) : new Date(0);
  const to = query.to ? endOfDay(new Date(query.to)) : new Date();

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ar.id
    FROM "AttendanceRecord" ar
    INNER JOIN "User" u ON u.id = ar."userId"
    WHERE u.role != 'DOCTOR' AND u."isActive" = true
      AND ar."checkIn" >= ${from}
      AND ar."checkIn" <= ${to}
      AND (
        EXTRACT(HOUR FROM ar."checkIn" AT TIME ZONE 'Asia/Jerusalem') > ${LATE_HOUR}
        OR (
          EXTRACT(HOUR FROM ar."checkIn" AT TIME ZONE 'Asia/Jerusalem') = ${LATE_HOUR}
          AND EXTRACT(MINUTE FROM ar."checkIn" AT TIME ZONE 'Asia/Jerusalem') > 0
        )
      )
      ${query.userId ? Prisma.sql`AND ar."userId" = ${query.userId}` : Prisma.empty}
  `;
  return rows.map((r) => r.id);
}

function buildRecordWhere(query: AttendanceManagementQuery, lateIds: string[] | null): Prisma.AttendanceRecordWhereInput {
  const where: Prisma.AttendanceRecordWhereInput = {
    user: employeeWhere(query),
    ...recordDateWhere(query),
  };

  if (query.status === "present") where.checkOut = null;
  if (query.status === "left") where.checkOut = { not: null };
  if (query.status === "late" && lateIds) where.id = { in: lateIds.length ? lateIds : ["__none__"] };

  if (query.gps === "valid") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { OR: [{ checkInLatitude: { not: null } }, { latitude: { not: null } }] },
      { OR: [{ checkInLongitude: { not: null } }, { longitude: { not: null } }] },
      {
        OR: [
          { checkInAccuracy: null },
          { checkInAccuracy: { lte: GPS_MAX_ACCURACY } },
        ],
      },
    ];
  }
  if (query.gps === "invalid") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { AND: [{ checkInLatitude: null }, { latitude: null }] },
          { checkInAccuracy: { gt: GPS_MAX_ACCURACY } },
        ],
      },
    ];
  }

  if (query.photo === "has") {
    where.OR = [
      { checkInPhotoUrl: { not: null } },
      { checkOutPhotoUrl: { not: null } },
    ];
  }
  if (query.photo === "none") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { checkInPhotoUrl: null },
      { checkOutPhotoUrl: null },
    ];
  }

  if (query.search?.trim()) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { checkInAddress: { contains: query.search.trim(), mode: "insensitive" } },
          { checkOutAddress: { contains: query.search.trim(), mode: "insensitive" } },
        ],
      },
    ];
  }

  return where;
}

function buildOrderBy(query: AttendanceManagementQuery): Prisma.AttendanceRecordOrderByWithRelationInput[] {
  const dir = query.sortDir === "asc" ? "asc" : "desc";
  switch (query.sortBy) {
    case "name":
      return [{ user: { name: dir } }];
    case "checkOut":
      return [{ checkOut: dir }];
    case "duration":
    case "date":
    case "checkIn":
    default:
      return [{ checkIn: dir }];
  }
}

export async function getAttendanceKpis(): Promise<AttendanceManagementKpis> {
  const { start: todayStart, end: todayEnd } = todayBounds();
  const { start: monthStart, end: monthEnd } = monthBounds();

  const [presentNow, finishedToday, employees, todayRecords, monthRecords] = await Promise.all([
    prisma.attendanceRecord.count({
      where: { checkOut: null, user: { role: { not: "DOCTOR" }, isActive: true } },
    }),
    prisma.attendanceRecord.count({
      where: {
        checkOut: { gte: todayStart, lte: todayEnd },
        user: { role: { not: "DOCTOR" }, isActive: true },
      },
    }),
    prisma.user.findMany({
      where: { role: { not: "DOCTOR" }, isActive: true },
      select: { id: true },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        checkIn: { gte: todayStart, lte: todayEnd },
        user: { role: { not: "DOCTOR" }, isActive: true },
      },
      select: { checkIn: true, checkOut: true, userId: true },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        checkIn: { gte: monthStart, lte: monthEnd },
        user: { role: { not: "DOCTOR" }, isActive: true },
      },
      select: { checkIn: true, checkOut: true },
    }),
  ]);

  const checkedInTodayIds = new Set(todayRecords.map((r) => r.userId));
  const notCheckedInToday = employees.filter((e) => !checkedInTodayIds.has(e.id)).length;

  const sumHours = (records: { checkIn: Date; checkOut: Date | null }[]) =>
    records.reduce((sum, r) => {
      const end = r.checkOut ?? new Date();
      return sum + (end.getTime() - r.checkIn.getTime()) / 3_600_000;
    }, 0);

  const hoursToday = sumHours(todayRecords);
  const hoursMonth = sumHours(monthRecords);
  const avgHoursPerEmployee = employees.length ? hoursMonth / employees.length : 0;

  return {
    presentNow,
    finishedToday,
    notCheckedInToday,
    hoursToday: Math.round(hoursToday * 10) / 10,
    hoursMonth: Math.round(hoursMonth * 10) / 10,
    avgHoursPerEmployee: Math.round(avgHoursPerEmployee * 10) / 10,
  };
}

export async function getActiveAttendanceRecords(
  query: AttendanceManagementQuery = {},
): Promise<AttendanceActiveRecord[]> {
  const where: Prisma.AttendanceRecordWhereInput = {
    checkOut: null,
    user: employeeWhere(query),
    ...recordDateWhere(query),
  };

  const rows = await prisma.attendanceRecord.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, roles: true, color: true } },
    },
    orderBy: { checkIn: "desc" },
  });

  const now = Date.now();
  return rows.map((row) => {
    const base = enrichRecord(mapAttendance(row), row.user);
    return {
      ...base,
      liveDurationMs: now - base.checkIn.getTime(),
    };
  });
}

export async function getNotCheckedInEmployees(
  query: AttendanceManagementQuery = {},
): Promise<AttendanceNotCheckedInRow[]> {
  const { start, end } = todayBounds();
  const todayRecords = await prisma.attendanceRecord.findMany({
    where: {
      checkIn: { gte: start, lte: end },
      user: employeeWhere(query),
    },
    select: { userId: true },
  });
  const checkedIds = new Set(todayRecords.map((r) => r.userId));

  const users = await prisma.user.findMany({
    where: {
      ...employeeWhere(query),
      id: { notIn: [...checkedIds] },
    },
    select: { id: true, name: true, phone: true, role: true, roles: true, color: true },
    orderBy: { name: "asc" },
  });

  return users.map((user) => ({
    id: `missing-${user.id}`,
    employee: mapEmployee(user),
    status: "not_checked_in" as const,
  }));
}

export async function getAttendanceRecords(
  query: AttendanceManagementQuery,
): Promise<AttendanceManagementRecordsResult> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const lateIds = await lateRecordIds(query);
  const where = buildRecordWhere(query, lateIds);

  const [total, rows] = await Promise.all([
    prisma.attendanceRecord.count({ where }),
    prisma.attendanceRecord.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true, role: true, roles: true, color: true } },
      },
      orderBy: buildOrderBy(query),
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    records: rows.map((row) => enrichRecord(mapAttendance(row), row.user)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getAttendanceRecordsForExport(
  query: AttendanceManagementQuery,
): Promise<AttendanceManagementRecord[]> {
  const exportQuery = { ...query, page: 1, limit: MAX_EXPORT };
  if (exportQuery.status === "not_checked_in") {
    const rows = await getNotCheckedInEmployees(exportQuery);
    return rows.map((r) => ({
      id: r.id,
      userId: r.employee.id,
      checkIn: new Date(),
      method: "MANUAL",
      employee: r.employee,
      durationHours: null,
      isLate: false,
      gpsValid: false,
      hasPhoto: false,
      createdAt: new Date(),
    }));
  }

  const lateIds = await lateRecordIds(exportQuery);
  const where = buildRecordWhere(exportQuery, lateIds);
  const rows = await prisma.attendanceRecord.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, roles: true, color: true } },
    },
    orderBy: buildOrderBy(exportQuery),
    take: MAX_EXPORT,
  });

  return rows.map((row) => enrichRecord(mapAttendance(row), row.user));
}

export async function getAttendanceRecordById(id: string): Promise<AttendanceManagementRecord | null> {
  const row = await prisma.attendanceRecord.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, roles: true, color: true } },
    },
  });
  if (!row) return null;
  return enrichRecord(mapAttendance(row), row.user);
}
