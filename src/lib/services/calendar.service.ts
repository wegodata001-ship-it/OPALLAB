import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { writeAuditLog } from "@/lib/audit-log";
import {
  MANAGER_CALENDAR_KEY,
  DEFAULT_CUSTOM_EVENT_TYPE,
  type CalendarEvent,
  type CalendarEventStatus,
  type CalendarEventType,
  type CalendarRecurrence,
  type CalendarReminder,
} from "@/lib/calendar/types";
import {
  canDeleteCalendarEvent,
  canEditCalendarEvents,
} from "@/lib/calendar/permissions";
import type { User } from "@/lib/types";
import { Prisma } from "@prisma/client";

function mapEvent(row: {
  id: string;
  calendarKey: string;
  title: string;
  description: string | null;
  location: string | null;
  type: CalendarEventType;
  status: CalendarEventStatus;
  color: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  isSystem: boolean;
  notes: string | null;
  phone: string | null;
  patientName: string | null;
  doctorName: string | null;
  orderId: string | null;
  doctorId: string | null;
  patientId: string | null;
  createdById: string | null;
  ownerUserId: string | null;
  recurrence: unknown;
  reminders: unknown;
  createdAt: Date;
  updatedAt: Date;
  order?: { id: string; serialNumber: string } | null;
}): CalendarEvent {
  return {
    ...row,
    recurrence: (row.recurrence as CalendarRecurrence | null) ?? null,
    reminders: Array.isArray(row.reminders) ? (row.reminders as CalendarReminder[]) : [],
    order: row.order ?? null,
  };
}

export type CreateCalendarEventInput = {
  calendarKey?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** Kept for system/legacy events; free-form UI defaults to REMINDER. */
  type?: CalendarEventType;
  status?: CalendarEventStatus;
  color?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
  notes?: string | null;
  phone?: string | null;
  patientName?: string | null;
  doctorName?: string | null;
  orderId?: string | null;
  doctorId?: string | null;
  patientId?: string | null;
  recurrence?: CalendarRecurrence | null;
  reminders?: CalendarReminder[];
  isSystem?: boolean;
};

export type UpdateCalendarEventInput = Partial<CreateCalendarEventInput> & {
  id: string;
};

export class CalendarService {
  async listEvents(input: {
    from: Date;
    to: Date;
    calendarKey?: string;
    types?: CalendarEventType[];
    statuses?: CalendarEventStatus[];
    q?: string;
  }): Promise<CalendarEvent[]> {
    const calendarKey = input.calendarKey ?? MANAGER_CALENDAR_KEY;
    const q = input.q?.trim();
    const where: Prisma.CalendarEventWhereInput = {
      calendarKey,
      startsAt: { lte: input.to },
      endsAt: { gte: input.from },
      ...(input.types?.length ? { type: { in: input.types } } : {}),
      ...(input.statuses?.length ? { status: { in: input.statuses } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
              { patientName: { contains: q, mode: "insensitive" } },
              { doctorName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { notes: { contains: q, mode: "insensitive" } },
              { order: { serialNumber: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const rows = await prisma.calendarEvent.findMany({
      where,
      include: { order: { select: { id: true, serialNumber: true } } },
      orderBy: { startsAt: "asc" },
      take: 2000,
    });
    return rows.map(mapEvent);
  }

  /** Upcoming events for dashboard widget — not ended, nearest first. */
  async listUpcomingEvents(input?: {
    calendarKey?: string;
    limit?: number;
    now?: Date;
  }): Promise<CalendarEvent[]> {
    const now = input?.now ?? new Date();
    const limit = Math.min(Math.max(input?.limit ?? 5, 1), 20);
    const calendarKey = input?.calendarKey ?? MANAGER_CALENDAR_KEY;
    const rows = await prisma.calendarEvent.findMany({
      where: {
        calendarKey,
        endsAt: { gte: now },
        status: { notIn: ["CANCELLED", "DONE", "NO_SHOW"] },
      },
      include: { order: { select: { id: true, serialNumber: true } } },
      orderBy: { startsAt: "asc" },
      take: limit,
    });
    return rows.map(mapEvent);
  }

  async getEvent(id: string): Promise<CalendarEvent | null> {
    const row = await prisma.calendarEvent.findUnique({
      where: { id },
      include: { order: { select: { id: true, serialNumber: true } } },
    });
    return row ? mapEvent(row) : null;
  }

  async createEvent(input: CreateCalendarEventInput, user: User): Promise<CalendarEvent> {
    if (!canEditCalendarEvents(user)) {
      throw new AppError("FORBIDDEN", "אין הרשאה ליצור אירועים ביומן", 403);
    }
    const title = input.title.trim();
    if (!title) {
      throw new AppError("VALIDATION_ERROR", "שם האירוע הוא שדה חובה", 400);
    }
    if (input.endsAt <= input.startsAt) {
      throw new AppError("VALIDATION_ERROR", "שעת סיום חייבת להיות אחרי שעת התחלה", 400);
    }

    const type = input.type ?? DEFAULT_CUSTOM_EVENT_TYPE;

    const row = await prisma.calendarEvent.create({
      data: {
        calendarKey: input.calendarKey ?? MANAGER_CALENDAR_KEY,
        title,
        description: input.description ?? null,
        location: input.location ?? null,
        type,
        status: input.status ?? "CONFIRMED",
        color: input.color ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allDay: input.allDay ?? false,
        isSystem: input.isSystem ?? false,
        notes: input.notes ?? null,
        phone: input.phone ?? null,
        patientName: input.patientName ?? null,
        doctorName: input.doctorName ?? null,
        orderId: input.orderId ?? null,
        doctorId: input.doctorId ?? null,
        patientId: input.patientId ?? null,
        createdById: user.id,
        ownerUserId: user.id,
        recurrence: (input.recurrence ?? undefined) as Prisma.InputJsonValue | undefined,
        reminders: (input.reminders ?? []) as unknown as Prisma.InputJsonValue,
      },
      include: { order: { select: { id: true, serialNumber: true } } },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CALENDAR_EVENT_CREATE",
      entityType: "calendar_event",
      entityId: row.id,
      details: { title: row.title, type: row.type, startsAt: row.startsAt.toISOString() },
    });

    return mapEvent(row);
  }

  async updateEvent(input: UpdateCalendarEventInput, user: User): Promise<CalendarEvent> {
    if (!canEditCalendarEvents(user)) {
      throw new AppError("FORBIDDEN", "אין הרשאה לערוך אירועים", 403);
    }
    const existing = await prisma.calendarEvent.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "אירוע לא נמצא", 404);

    if (existing.isSystem && input.type && input.type !== existing.type) {
      // secretary can edit times/title of system events but not convert type away casually — allowed
    }

    const startsAt = input.startsAt ?? existing.startsAt;
    const endsAt = input.endsAt ?? existing.endsAt;
    if (endsAt <= startsAt) {
      throw new AppError("VALIDATION_ERROR", "שעת סיום חייבת להיות אחרי שעת התחלה", 400);
    }

    const row = await prisma.calendarEvent.update({
      where: { id: input.id },
      data: {
        title: input.title?.trim() || undefined,
        description: input.description !== undefined ? input.description : undefined,
        location: input.location !== undefined ? input.location : undefined,
        type: input.type,
        status: input.status,
        color: input.color !== undefined ? input.color : undefined,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allDay: input.allDay,
        notes: input.notes !== undefined ? input.notes : undefined,
        phone: input.phone !== undefined ? input.phone : undefined,
        patientName: input.patientName !== undefined ? input.patientName : undefined,
        doctorName: input.doctorName !== undefined ? input.doctorName : undefined,
        orderId: input.orderId !== undefined ? input.orderId : undefined,
        doctorId: input.doctorId !== undefined ? input.doctorId : undefined,
        patientId: input.patientId !== undefined ? input.patientId : undefined,
        recurrence:
          input.recurrence !== undefined
            ? ((input.recurrence ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue)
            : undefined,
        reminders:
          input.reminders !== undefined
            ? (input.reminders as unknown as Prisma.InputJsonValue)
            : undefined,
      },
      include: { order: { select: { id: true, serialNumber: true } } },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CALENDAR_EVENT_UPDATE",
      entityType: "calendar_event",
      entityId: row.id,
      details: { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() },
    });

    return mapEvent(row);
  }

  async moveEvent(
    id: string,
    startsAt: Date,
    endsAt: Date,
    user: User,
  ): Promise<CalendarEvent> {
    return this.updateEvent({ id, startsAt, endsAt }, user);
  }

  async deleteEvent(id: string, user: User): Promise<void> {
    const existing = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "אירוע לא נמצא", 404);
    if (!canDeleteCalendarEvent(user, existing)) {
      throw new AppError("FORBIDDEN", "אין הרשאה למחוק אירוע מערכתי", 403);
    }
    await prisma.calendarEvent.delete({ where: { id } });
    await writeAuditLog({
      userId: user.id,
      action: "CALENDAR_EVENT_DELETE",
      entityType: "calendar_event",
      entityId: id,
      details: { title: existing.title, isSystem: existing.isSystem },
    });
  }

  /** Day has vacation/blocked all-day events. */
  async isDayBlocked(day: Date, calendarKey = MANAGER_CALENDAR_KEY): Promise<boolean> {
    const from = new Date(day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(day);
    to.setHours(23, 59, 59, 999);
    const count = await prisma.calendarEvent.count({
      where: {
        calendarKey,
        allDay: true,
        type: { in: ["VACATION", "BLOCKED"] },
        status: { notIn: ["CANCELLED"] },
        startsAt: { lte: to },
        endsAt: { gte: from },
      },
    });
    return count > 0;
  }

  /**
   * Upsert linked delivery/pickup events from an order (system events).
   * Pass `undefined` to leave that type untouched; `null` clears it.
   */
  async syncOrderSchedule(input: {
    orderId: string;
    serialNumber: string;
    doctorName?: string | null;
    patientName?: string | null;
    doctorId?: string | null;
    patientId?: string | null;
    deliveryAt?: Date | null;
    pickupAt?: Date | null;
    userId: string;
  }): Promise<void> {
    const base = {
      calendarKey: MANAGER_CALENDAR_KEY,
      isSystem: true,
      orderId: input.orderId,
      doctorId: input.doctorId ?? null,
      patientId: input.patientId ?? null,
      doctorName: input.doctorName ?? null,
      patientName: input.patientName ?? null,
      createdById: input.userId,
      status: "CONFIRMED" as const,
    };

    if (input.deliveryAt !== undefined) {
      await prisma.calendarEvent.deleteMany({
        where: { orderId: input.orderId, type: "DELIVERY", isSystem: true },
      });
      if (input.deliveryAt) {
        const startsAt = new Date(input.deliveryAt);
        if (startsAt.getHours() === 0 && startsAt.getMinutes() === 0) {
          startsAt.setHours(10, 0, 0, 0);
        }
        const endsAt = new Date(startsAt.getTime() + 60 * 60000);
        await prisma.calendarEvent.create({
          data: {
            ...base,
            type: "DELIVERY",
            title: `מסירה · ${input.serialNumber}`,
            startsAt,
            endsAt,
          },
        });
      }
    }

    if (input.pickupAt !== undefined) {
      await prisma.calendarEvent.deleteMany({
        where: { orderId: input.orderId, type: "PICKUP", isSystem: true },
      });
      if (input.pickupAt) {
        const startsAt = new Date(input.pickupAt);
        if (startsAt.getHours() === 0 && startsAt.getMinutes() === 0) {
          startsAt.setHours(11, 0, 0, 0);
        }
        const endsAt = new Date(startsAt.getTime() + 60 * 60000);
        await prisma.calendarEvent.create({
          data: {
            ...base,
            type: "PICKUP",
            title: `איסוף · ${input.serialNumber}`,
            startsAt,
            endsAt,
          },
        });
      }
    }
  }
}

export const calendarService = new CalendarService();
