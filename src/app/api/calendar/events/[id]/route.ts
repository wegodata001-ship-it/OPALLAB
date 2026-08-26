import { calendarService } from "@/lib/services/calendar.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import type { CalendarEventStatus, CalendarEventType } from "@/lib/calendar/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "calendar", "CALENDAR_ACCESS");
    const { id } = await context.params;
    const event = await calendarService.getEvent(id);
    return jsonOk({ event });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "calendar", "CALENDAR_UPDATE");
    const { id } = await context.params;
    const body = await parseJsonBody<{
      title?: string;
      type?: CalendarEventType;
      status?: CalendarEventStatus;
      startsAt?: string;
      endsAt?: string;
      description?: string | null;
      location?: string | null;
      color?: string | null;
      allDay?: boolean;
      notes?: string | null;
      phone?: string | null;
      patientName?: string | null;
      doctorName?: string | null;
      orderId?: string | null;
      doctorId?: string | null;
      patientId?: string | null;
      moveOnly?: boolean;
    }>(request);

    const event = await calendarService.updateEvent(
      {
        id,
        ...body,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
      },
      user,
    );
    return jsonOk({ event });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "calendar", "CALENDAR_DELETE");
    const { id } = await context.params;
    await calendarService.deleteEvent(id, user);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
