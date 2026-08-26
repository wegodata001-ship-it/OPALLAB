import { calendarService } from "@/lib/services/calendar.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import type { CalendarEventStatus, CalendarEventType } from "@/lib/calendar/types";
import { AppError } from "@/lib/errors/app-error";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "calendar", "CALENDAR_ACCESS");
    const url = new URL(request.url);
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    if (!fromRaw || !toRaw) {
      throw new AppError("VALIDATION_ERROR", "נדרשים from ו־to", 400);
    }
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    const q = url.searchParams.get("q") ?? undefined;
    const types = url.searchParams.getAll("type") as CalendarEventType[];
    const statuses = url.searchParams.getAll("status") as CalendarEventStatus[];
    const calendarKey = url.searchParams.get("calendarKey") ?? undefined;

    const events = await calendarService.listEvents({
      from,
      to,
      q,
      types: types.length ? types : undefined,
      statuses: statuses.length ? statuses : undefined,
      calendarKey: calendarKey ?? undefined,
    });
    return jsonOk({ events });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "calendar", "CALENDAR_CREATE");
    const body = await parseJsonBody<{
      title: string;
      type?: CalendarEventType;
      startsAt: string;
      endsAt: string;
      description?: string | null;
      location?: string | null;
      status?: CalendarEventStatus;
      color?: string | null;
      allDay?: boolean;
      notes?: string | null;
      phone?: string | null;
      patientName?: string | null;
      doctorName?: string | null;
      orderId?: string | null;
      doctorId?: string | null;
      patientId?: string | null;
      forceOnVacation?: boolean;
      calendarKey?: string;
      recurrence?: { freq: string; interval?: number } | null;
    }>(request);

    if (!body.forceOnVacation) {
      const blocked = await calendarService.isDayBlocked(new Date(body.startsAt));
      if (blocked) {
        throw new AppError(
          "VALIDATION_ERROR",
          "היום מסומן כחופשה. האם בכל זאת ליצור אירוע?",
          409,
          { code: "DAY_BLOCKED" },
        );
      }
    }

    const event = await calendarService.createEvent(
      {
        ...body,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        recurrence: body.recurrence
          ? {
              freq: body.recurrence.freq as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
              interval: body.recurrence.interval,
            }
          : body.recurrence === null
            ? null
            : undefined,
      },
      user,
    );
    return jsonOk({ event });
  } catch (error) {
    return jsonError(error);
  }
}
