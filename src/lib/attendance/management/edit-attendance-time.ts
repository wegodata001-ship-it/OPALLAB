import { AppError } from "@/lib/errors/app-error";
import { writeAuditLog, getAuditLogsForEntity } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  formatHHmmJerusalem,
  jerusalemDateKey,
  jerusalemDayBounds,
  resolveEditedAttendanceTimes,
  resolveFullAttendanceTimes,
  type AttendanceTimeField,
} from "@/lib/attendance/management/edit-time";
import type {
  AttendanceManagementRecord,
  AttendanceTimeEditMeta,
} from "@/lib/attendance/management/types";

export const ATTENDANCE_TIME_EDIT_ACTION = "ATTENDANCE_TIME_EDIT";
export const ATTENDANCE_MANUAL_CREATE_ACTION = "ATTENDANCE_MANUAL_CREATE";
export const ATTENDANCE_MANUAL_EDIT_ACTION = "ATTENDANCE_MANUAL_EDIT";

const DUPLICATE_DAY_MESSAGE = "כבר קיימת נוכחות לעובד בתאריך שנבחר.";

async function findAttendanceOnJerusalemDay(
  userId: string,
  dateKey: string,
  excludeRecordId?: string,
): Promise<{ id: string } | null> {
  const { from, to } = jerusalemDayBounds(dateKey);
  return prisma.attendanceRecord.findFirst({
    where: {
      userId,
      checkIn: { gte: from, lte: to },
      ...(excludeRecordId ? { id: { not: excludeRecordId } } : {}),
    },
    select: { id: true },
  });
}

function mapResolveError(err: unknown): never {
  const code = err instanceof Error ? err.message : "";
  if (code === "INVALID_CHECKIN" || code === "INVALID_CHECKOUT" || code === "INVALID_TIME") {
    throw new AppError("VALIDATION_ERROR", "תאריך או שעה לא חוקיים", 400);
  }
  if (code === "INCOMPLETE_CHECKOUT") {
    throw new AppError("VALIDATION_ERROR", "יש להזין גם תאריך וגם שעת יציאה", 400);
  }
  if (code === "CHECKOUT_BEFORE_CHECKIN") {
    throw new AppError(
      "VALIDATION_ERROR",
      "שעת היציאה לא יכולה להיות לפני או שווה לשעת הכניסה",
      400,
    );
  }
  throw err;
}

export async function createManualAttendance(input: {
  userId: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate?: string | null;
  checkOutTime?: string | null;
  actorId: string;
}): Promise<AttendanceManagementRecord> {
  let resolved: { checkIn: Date; checkOut: Date | null };
  try {
    resolved = resolveFullAttendanceTimes({
      checkInDate: input.checkInDate,
      checkInTime: input.checkInTime,
      checkOutDate: input.checkOutDate,
      checkOutTime: input.checkOutTime,
    });
  } catch (err) {
    mapResolveError(err);
  }

  const checkInDay = jerusalemDateKey(resolved!.checkIn);
  const conflict = await findAttendanceOnJerusalemDay(input.userId, checkInDay);
  if (conflict) {
    throw new AppError("CONFLICT", DUPLICATE_DAY_MESSAGE, 409, {
      existingRecordId: conflict.id,
    });
  }

  const created = await prisma.attendanceRecord.create({
    data: {
      userId: input.userId,
      checkIn: resolved!.checkIn,
      checkOut: resolved!.checkOut,
      method: "MANUAL",
    },
  });

  const editedAt = new Date();
  await writeAuditLog({
    userId: input.actorId,
    action: ATTENDANCE_MANUAL_CREATE_ACTION,
    entityType: "AttendanceRecord",
    entityId: created.id,
    details: {
      employeeId: input.userId,
      attendanceId: created.id,
      newCheckInDateTime: resolved!.checkIn.toISOString(),
      newCheckOutDateTime: resolved!.checkOut?.toISOString() ?? null,
      editedBy: input.actorId,
      editedByUserId: input.actorId,
      editedAt: editedAt.toISOString(),
      reason: "ATTENDANCE_MANUAL_CREATE",
    },
  });

  const { getAttendanceRecordById } = await import("@/lib/attendance/management/service");
  const record = await getAttendanceRecordById(created.id);
  if (!record) throw new AppError("NOT_FOUND", "רשומת נוכחות לא נמצאה", 404);
  return record;
}

export async function updateAttendanceDateTimes(input: {
  recordId: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate?: string | null;
  checkOutTime?: string | null;
  actorId: string;
}): Promise<AttendanceManagementRecord> {
  const existing = await prisma.attendanceRecord.findUnique({
    where: { id: input.recordId },
  });
  if (!existing) throw new AppError("NOT_FOUND", "רשומת נוכחות לא נמצאה", 404);

  let resolved: { checkIn: Date; checkOut: Date | null };
  try {
    resolved = resolveFullAttendanceTimes({
      checkInDate: input.checkInDate,
      checkInTime: input.checkInTime,
      checkOutDate: input.checkOutDate,
      checkOutTime: input.checkOutTime,
    });
  } catch (err) {
    mapResolveError(err);
  }

  const oldCheckInDay = jerusalemDateKey(existing.checkIn);
  const newCheckInDay = jerusalemDateKey(resolved!.checkIn);
  if (newCheckInDay !== oldCheckInDay) {
    const conflict = await findAttendanceOnJerusalemDay(
      existing.userId,
      newCheckInDay,
      input.recordId,
    );
    if (conflict) {
      throw new AppError("CONFLICT", DUPLICATE_DAY_MESSAGE, 409, {
        existingRecordId: conflict.id,
      });
    }
  }

  const oldCheckIn = existing.checkIn.toISOString();
  const oldCheckOut = existing.checkOut?.toISOString() ?? null;
  const newCheckIn = resolved!.checkIn.toISOString();
  const newCheckOut = resolved!.checkOut?.toISOString() ?? null;

  if (oldCheckIn !== newCheckIn || oldCheckOut !== newCheckOut) {
    await prisma.attendanceRecord.update({
      where: { id: input.recordId },
      data: {
        checkIn: resolved!.checkIn,
        checkOut: resolved!.checkOut,
      },
    });

    const editedAt = new Date();
    await writeAuditLog({
      userId: input.actorId,
      action: ATTENDANCE_MANUAL_EDIT_ACTION,
      entityType: "AttendanceRecord",
      entityId: input.recordId,
      details: {
        employeeId: existing.userId,
        attendanceId: input.recordId,
        oldCheckInDateTime: oldCheckIn,
        newCheckInDateTime: newCheckIn,
        oldCheckOutDateTime: oldCheckOut,
        newCheckOutDateTime: newCheckOut,
        oldCheckIn: oldCheckIn,
        newCheckIn,
        oldCheckOut,
        newCheckOut,
        editedBy: input.actorId,
        editedByUserId: input.actorId,
        editedAt: editedAt.toISOString(),
        reason: "ATTENDANCE_MANUAL_EDIT",
        methodUnchanged: existing.method,
        gpsPreserved: true,
      },
    });
  }

  const { getAttendanceRecordById } = await import("@/lib/attendance/management/service");
  const record = await getAttendanceRecordById(input.recordId);
  if (!record) throw new AppError("NOT_FOUND", "רשומת נוכחות לא נמצאה", 404);
  return record;
}

export async function editAttendanceTime(input: {
  recordId: string;
  field: AttendanceTimeField;
  /** HH:mm on the existing Jerusalem calendar day (card editor). */
  timeHHmm?: string;
  /** Full ISO timestamp (Accounts / advanced). */
  absoluteIso?: string;
  actorId: string;
}): Promise<AttendanceManagementRecord> {
  const field = input.field;
  if (field !== "checkIn" && field !== "checkOut") {
    throw new AppError("VALIDATION_ERROR", "שדה לא תקין", 400);
  }

  const existing = await prisma.attendanceRecord.findUnique({
    where: { id: input.recordId },
  });
  if (!existing) throw new AppError("NOT_FOUND", "רשומת נוכחות לא נמצאה", 404);

  let resolved: { checkIn: Date; checkOut: Date | null };

  if (input.absoluteIso) {
    const absolute = new Date(input.absoluteIso);
    if (Number.isNaN(absolute.getTime())) {
      throw new AppError("VALIDATION_ERROR", "שעה לא חוקית", 400);
    }
    if (field === "checkIn") {
      const checkOut = existing.checkOut ? new Date(existing.checkOut) : null;
      if (checkOut && checkOut.getTime() <= absolute.getTime()) {
        throw new AppError(
          "VALIDATION_ERROR",
          "שעת היציאה לא יכולה להיות לפני או שווה לשעת הכניסה",
          400,
        );
      }
      resolved = { checkIn: absolute, checkOut };
    } else {
      if (absolute.getTime() <= existing.checkIn.getTime()) {
        throw new AppError(
          "VALIDATION_ERROR",
          "שעת היציאה לא יכולה להיות לפני או שווה לשעת הכניסה",
          400,
        );
      }
      resolved = { checkIn: new Date(existing.checkIn), checkOut: absolute };
    }
  } else if (input.timeHHmm) {
    try {
      resolved = resolveEditedAttendanceTimes({
        field,
        timeHHmm: input.timeHHmm,
        currentCheckIn: existing.checkIn,
        currentCheckOut: existing.checkOut,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "INVALID_TIME") {
        throw new AppError("VALIDATION_ERROR", "שעה לא חוקית. השתמשו בפורמט HH:mm", 400);
      }
      if (code === "CHECKOUT_BEFORE_CHECKIN") {
        throw new AppError(
          "VALIDATION_ERROR",
          "שעת היציאה לא יכולה להיות לפני או שווה לשעת הכניסה",
          400,
        );
      }
      throw err;
    }
  } else {
    throw new AppError("VALIDATION_ERROR", "חסרה שעה", 400);
  }

  const oldValue =
    field === "checkIn"
      ? existing.checkIn.toISOString()
      : existing.checkOut
        ? existing.checkOut.toISOString()
        : null;
  const newValue =
    field === "checkIn" ? resolved.checkIn.toISOString() : resolved.checkOut!.toISOString();

  if (oldValue !== newValue) {
    // Only touch time fields — never method / GPS / device metadata.
    const data =
      field === "checkIn"
        ? { checkIn: resolved.checkIn }
        : { checkOut: resolved.checkOut };

    await prisma.attendanceRecord.update({
      where: { id: input.recordId },
      data,
    });

    const editedAt = new Date();
    const attendanceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
    }).format(existing.checkIn);
    await writeAuditLog({
      userId: input.actorId,
      action: ATTENDANCE_TIME_EDIT_ACTION,
      entityType: "AttendanceRecord",
      entityId: input.recordId,
      details: {
        field,
        employeeId: existing.userId,
        attendanceId: input.recordId,
        date: attendanceDate,
        oldCheckIn: existing.checkIn.toISOString(),
        newCheckIn: resolved.checkIn.toISOString(),
        oldCheckOut: existing.checkOut?.toISOString() ?? null,
        newCheckOut: resolved.checkOut?.toISOString() ?? null,
        oldValue,
        newValue,
        oldDisplay: oldValue ? formatHHmmJerusalem(new Date(oldValue)) : null,
        newDisplay: formatHHmmJerusalem(new Date(newValue)),
        editedBy: input.actorId,
        editedByUserId: input.actorId,
        editedAt: editedAt.toISOString(),
        reason: "ATTENDANCE_MANUAL_EDIT",
        methodUnchanged: existing.method,
        gpsPreserved: true,
      },
    });
  }

  const { getAttendanceRecordById } = await import("@/lib/attendance/management/service");
  const record = await getAttendanceRecordById(input.recordId);
  if (!record) throw new AppError("NOT_FOUND", "רשומת נוכחות לא נמצאה", 404);
  return record;
}

export async function loadTimeEditMetaForRecords(
  recordIds: string[],
): Promise<Map<string, NonNullable<AttendanceManagementRecord["timeEdits"]>>> {
  const map = new Map<string, NonNullable<AttendanceManagementRecord["timeEdits"]>>();
  if (recordIds.length === 0) return map;

  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: "AttendanceRecord",
      action: {
        in: [
          ATTENDANCE_TIME_EDIT_ACTION,
          ATTENDANCE_MANUAL_EDIT_ACTION,
        ],
      },
      entityId: { in: recordIds },
    },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, username: true } } },
  });

  for (const log of logs) {
    const details = (log.details ?? {}) as Record<string, unknown>;
    const field =
      details.field === "checkOut"
        ? "checkOut"
        : details.field === "checkIn"
          ? "checkIn"
          : null;
    if (!field) continue;
    const bucket = map.get(log.entityId) ?? {};
    if (bucket[field]) continue; // keep latest only
    const meta: AttendanceTimeEditMeta = {
      field,
      oldValue: typeof details.oldValue === "string" ? details.oldValue : null,
      newValue:
        typeof details.newValue === "string" ? details.newValue : String(details.newValue ?? ""),
      editedByUserId:
        typeof details.editedByUserId === "string" ? details.editedByUserId : log.userId,
      editedByName: log.user?.name ?? log.user?.username ?? "—",
      editedAt:
        typeof details.editedAt === "string" ? details.editedAt : log.createdAt.toISOString(),
      oldDisplay:
        typeof details.oldDisplay === "string"
          ? details.oldDisplay
          : details.oldValue
            ? formatHHmmJerusalem(new Date(String(details.oldValue)))
            : null,
      newDisplay:
        typeof details.newDisplay === "string"
          ? details.newDisplay
          : formatHHmmJerusalem(new Date(String(details.newValue ?? log.createdAt))),
    };
    bucket[field] = meta;
    map.set(log.entityId, bucket);
  }

  return map;
}

export async function getAttendanceTimeEditHistory(recordId: string) {
  return getAuditLogsForEntity("AttendanceRecord", recordId);
}
