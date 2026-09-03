import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mapAttendance } from "@/lib/mappers/prisma-to-app";
import type { UserRole } from "@/lib/types";
import type {
  AttendanceActiveRecord,
  AttendanceEmployeeRosterRow,
  AttendanceEmployeeStats,
  AttendanceEmployeeSummary,
  AttendanceLabGeo,
  AttendanceManagementKpis,
  AttendanceManagementQuery,
  AttendanceManagementRecord,
  AttendanceManagementRecordsResult,
  AttendanceNotCheckedInRow,
} from "@/lib/attendance/management/types";
import { getLabGateSettings } from "@/lib/attendance/gate/lab-location";
import {
  detectAttendanceAnomalies,
  methodChannelLabel,
  isLateCheckIn,
} from "@/lib/attendance/management/status";
import { EXPECTED_START_HOUR } from "@/lib/attendance/management/attendance-status";
import { loadTimeEditMetaForRecords } from "@/lib/attendance/management/edit-attendance-time";

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

export { isLateCheckIn } from "@/lib/attendance/management/status";

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

export function enrichAttendanceRecord(
  record: ReturnType<typeof mapAttendance>,
  user: Parameters<typeof mapEmployee>[0],
  labGeo?: AttendanceLabGeo | null,
): AttendanceManagementRecord {
  const end = record.checkOut ?? new Date();
  const durationHours = (end.getTime() - record.checkIn.getTime()) / 3_600_000;
  const closedHours = record.checkOut ? durationHours : null;
  const lat = record.checkInLatitude ?? record.latitude;
  const lng = record.checkInLongitude ?? record.longitude;
  const isLate = isLateCheckIn(record.checkIn);
  const flags = detectAttendanceAnomalies({
    checkIn: record.checkIn,
    checkOut: record.checkOut,
    checkInLatitude: lat,
    checkInLongitude: lng,
    checkOutLatitude: record.checkOutLatitude,
    checkOutLongitude: record.checkOutLongitude,
    checkInAccuracy: record.checkInAccuracy,
    isLate,
    durationHours: closedHours,
    labGeo,
  });
  return {
    ...record,
    employee: mapEmployee(user),
    durationHours: closedHours,
    isLate,
    gpsValid: isGpsValid(lat, lng, record.checkInAccuracy),
    anomalies: flags.anomalies,
    complianceStatus: flags.complianceStatus,
    outOfGeofence: flags.outOfGeofence,
    isEarlyLeave: flags.isEarlyLeave,
    isOvertime: flags.isOvertime,
    channelLabel: methodChannelLabel(record.method, record.nfcTagId),
  };
}

async function withTimeEditMeta(
  records: AttendanceManagementRecord[],
): Promise<AttendanceManagementRecord[]> {
  const edits = await loadTimeEditMetaForRecords(records.map((r) => r.id));
  return records.map((r) => ({
    ...r,
    timeEdits: edits.get(r.id) ?? {},
  }));
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
            { username: { contains: search, mode: "insensitive" } },
            { id: { contains: search, mode: "insensitive" } },
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
  if (query.status !== "late" && !query.lateOnly) return null;

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
        EXTRACT(HOUR FROM ar."checkIn" AT TIME ZONE 'Asia/Jerusalem') > ${EXPECTED_START_HOUR}
        OR (
          EXTRACT(HOUR FROM ar."checkIn" AT TIME ZONE 'Asia/Jerusalem') = ${EXPECTED_START_HOUR}
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
  if ((query.status === "late" || query.lateOnly) && lateIds) {
    where.id = { in: lateIds.length ? lateIds : ["__none__"] };
  }

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
  const lateToday = todayRecords.filter((r) => isLateCheckIn(r.checkIn)).length;

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
    lateToday,
    hoursToday: Math.round(hoursToday * 10) / 10,
    hoursMonth: Math.round(hoursMonth * 10) / 10,
    avgHoursPerEmployee: Math.round(avgHoursPerEmployee * 10) / 10,
  };
}

export async function getAttendanceLabGeo(): Promise<AttendanceLabGeo> {
  const lab = await getLabGateSettings();
  return {
    labLatitude: lab.labLatitude,
    labLongitude: lab.labLongitude,
    geofenceRadiusMeters: lab.geofenceRadiusMeters,
    geofenceEnabled: lab.geofenceEnabled,
  };
}

/** One row per active non-doctor employee with latest trusted device + last punch. */
export async function getEmployeeAttendanceRoster(): Promise<AttendanceEmployeeRosterRow[]> {
  const [users, devices, openRecords, recentRecords] = await Promise.all([
    prisma.user.findMany({
      where: { role: { not: "DOCTOR" }, isActive: true },
      select: { id: true, name: true, phone: true, role: true, roles: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.trustedDevice.findMany({
      orderBy: [{ lastUsedAt: "desc" }, { registeredAt: "desc" }],
    }),
    prisma.attendanceRecord.findMany({
      where: { checkOut: null, user: { role: { not: "DOCTOR" }, isActive: true } },
      select: { userId: true },
    }),
    prisma.attendanceRecord.findMany({
      where: { user: { role: { not: "DOCTOR" }, isActive: true } },
      orderBy: { checkIn: "desc" },
      take: 500,
      select: { userId: true, checkIn: true, checkOut: true },
    }),
  ]);

  const deviceByUser = new Map<string, (typeof devices)[number]>();
  for (const d of devices) {
    if (!deviceByUser.has(d.userId)) deviceByUser.set(d.userId, d);
  }
  const presentIds = new Set(openRecords.map((r) => r.userId));
  const lastByUser = new Map<string, (typeof recentRecords)[number]>();
  for (const r of recentRecords) {
    if (!lastByUser.has(r.userId)) lastByUser.set(r.userId, r);
  }

  return users.map((user) => {
    const device = deviceByUser.get(user.id);
    const last = lastByUser.get(user.id);
    return {
      employee: mapEmployee(user),
      deviceId: device?.id ?? null,
      deviceStatus: device?.status ?? "NONE",
      deviceLabel: device?.label ?? null,
      deviceOs: device?.os ?? null,
      deviceBrowser: device?.browser ?? null,
      deviceType: device?.deviceType ?? null,
      lastCheckIn: last?.checkIn?.toISOString() ?? null,
      lastCheckOut: last?.checkOut?.toISOString() ?? null,
      isPresent: presentIds.has(user.id),
    };
  });
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
  const labGeo = await getAttendanceLabGeo();
  return rows.map((row) => {
    const base = enrichAttendanceRecord(mapAttendance(row), row.user, labGeo);
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
  const labGeo = await getAttendanceLabGeo();
  const needsPostFilter = Boolean(query.overtimeOnly || query.anomaliesOnly || query.compliance);

  if (!needsPostFilter) {
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
      records: await withTimeEditMeta(
        rows.map((row) => enrichAttendanceRecord(mapAttendance(row), row.user, labGeo)),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  const rows = await prisma.attendanceRecord.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, roles: true, color: true } },
    },
    orderBy: buildOrderBy(query),
    take: MAX_EXPORT,
  });

  let records = rows.map((row) => enrichAttendanceRecord(mapAttendance(row), row.user, labGeo));
  if (query.overtimeOnly) records = records.filter((r) => r.isOvertime);
  if (query.anomaliesOnly) records = records.filter((r) => r.complianceStatus !== "ok");
  if (query.compliance) {
    records = records.filter((r) => r.complianceStatus === query.compliance);
  }

  const total = records.length;
  const start = (page - 1) * limit;
  return {
    records: await withTimeEditMeta(records.slice(start, start + limit)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getEmployeeAttendanceStats(
  userId: string,
  query: Pick<AttendanceManagementQuery, "from" | "to"> = {},
): Promise<AttendanceEmployeeStats> {
  const labGeo = await getAttendanceLabGeo();
  const rows = await prisma.attendanceRecord.findMany({
    where: {
      userId,
      ...recordDateWhere(query),
    },
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, roles: true, color: true } },
    },
    orderBy: { checkIn: "desc" },
    take: MAX_EXPORT,
  });

  const records = rows.map((row) => enrichAttendanceRecord(mapAttendance(row), row.user, labGeo));

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
      method: "MANUAL" as const,
      employee: r.employee,
      durationHours: null,
      isLate: false,
      gpsValid: false,
      anomalies: ["missing_checkout" as const],
      complianceStatus: "missing" as const,
      outOfGeofence: false,
      isEarlyLeave: false,
      isOvertime: false,
      channelLabel: "—",
      createdAt: new Date(),
    }));
  }

  const lateIds = await lateRecordIds(exportQuery);
  const where = buildRecordWhere(exportQuery, lateIds);
  const labGeo = await getAttendanceLabGeo();
  const rows = await prisma.attendanceRecord.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, roles: true, color: true } },
    },
    orderBy: buildOrderBy(exportQuery),
    take: MAX_EXPORT,
  });

  let records = rows.map((row) => enrichAttendanceRecord(mapAttendance(row), row.user, labGeo));
  if (exportQuery.overtimeOnly) records = records.filter((r) => r.isOvertime);
  if (exportQuery.anomaliesOnly) records = records.filter((r) => r.complianceStatus !== "ok");
  if (exportQuery.compliance) {
    records = records.filter((r) => r.complianceStatus === exportQuery.compliance);
  }
  return records;
}

export async function getAttendanceRecordById(id: string): Promise<AttendanceManagementRecord | null> {
  const labGeo = await getAttendanceLabGeo();
  const row = await prisma.attendanceRecord.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, roles: true, color: true } },
    },
  });
  if (!row) return null;
  const [enriched] = await withTimeEditMeta([
    enrichAttendanceRecord(mapAttendance(row), row.user, labGeo),
  ]);
  return enriched;
}
