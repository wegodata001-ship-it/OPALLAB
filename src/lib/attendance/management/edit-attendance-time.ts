import { AppError } from "@/lib/errors/app-error";
import { writeAuditLog, getAuditLogsForEntity } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import {
  formatHHmmJerusalem,
  resolveEditedAttendanceTimes,
  type AttendanceTimeField,
} from "@/lib/attendance/management/edit-time";
import type {
  AttendanceManagementRecord,
  AttendanceTimeEditMeta,
} from "@/lib/attendance/management/types";

export const ATTENDANCE_TIME_EDIT_ACTION = "ATTENDANCE_TIME_EDIT";

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
    await writeAuditLog({
      userId: input.actorId,
      action: ATTENDANCE_TIME_EDIT_ACTION,
      entityType: "AttendanceRecord",
      entityId: input.recordId,
      details: {
        field,
        oldValue,
        newValue,
        oldDisplay: oldValue ? formatHHmmJerusalem(new Date(oldValue)) : null,
        newDisplay: formatHHmmJerusalem(new Date(newValue)),
        editedByUserId: input.actorId,
        editedAt: editedAt.toISOString(),
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
      action: ATTENDANCE_TIME_EDIT_ACTION,
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
