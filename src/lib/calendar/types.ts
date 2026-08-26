/** Manager Calendar V1 — shared types, colors, labels (modular engine). */

export type CalendarEventType =
  | "DOCTOR_MEETING"
  | "NEW_CLIENT"
  | "DELIVERY"
  | "PICKUP"
  | "TASK"
  | "VACATION"
  | "BLOCKED"
  | "REVIEW"
  | "TEAM_MEETING"
  | "REMINDER";

export type CalendarEventStatus =
  | "CONFIRMED"
  | "PENDING"
  | "DONE"
  | "CANCELLED"
  | "NO_SHOW"
  | "RESCHEDULED";

export type CalendarView = "day" | "week" | "month" | "timeline" | "agenda";

export interface CalendarReminder {
  minutesBefore: number;
  channel: "APP" | "WHATSAPP" | "EMAIL";
}

export interface CalendarRecurrence {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval?: number;
  until?: string;
  count?: number;
}

export interface CalendarEvent {
  id: string;
  calendarKey: string;
  title: string;
  description?: string | null;
  location?: string | null;
  type: CalendarEventType;
  status: CalendarEventStatus;
  color?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  isSystem: boolean;
  notes?: string | null;
  phone?: string | null;
  patientName?: string | null;
  doctorName?: string | null;
  orderId?: string | null;
  doctorId?: string | null;
  patientId?: string | null;
  createdById?: string | null;
  ownerUserId?: string | null;
  recurrence?: CalendarRecurrence | null;
  reminders: CalendarReminder[];
  createdAt: Date;
  updatedAt: Date;
  order?: { id: string; serialNumber: string } | null;
}

export const CALENDAR_TYPE_LABELS: Record<CalendarEventType, string> = {
  DOCTOR_MEETING: "פגישת רופא",
  NEW_CLIENT: "לקוח חדש",
  DELIVERY: "מסירת עבודה",
  PICKUP: "איסוף עבודה",
  TASK: "משימה",
  VACATION: "חופשה",
  BLOCKED: "יום חסום",
  REVIEW: "ביקורת",
  TEAM_MEETING: "ישיבת צוות",
  REMINDER: "תזכורת",
};

export const CALENDAR_TYPE_COLORS: Record<CalendarEventType, string> = {
  DOCTOR_MEETING: "#8b5cf6",
  NEW_CLIENT: "#22c55e",
  DELIVERY: "#3b82f6",
  PICKUP: "#f97316",
  TASK: "#eab308",
  VACATION: "#ef4444",
  BLOCKED: "#334155",
  REVIEW: "#ec4899",
  TEAM_MEETING: "#6366f1",
  REMINDER: "#10b981",
};

export const CALENDAR_TYPE_ICONS: Record<CalendarEventType, string> = {
  DOCTOR_MEETING: "🟣",
  NEW_CLIENT: "🟢",
  DELIVERY: "🔵",
  PICKUP: "🟠",
  TASK: "🟡",
  VACATION: "🔴",
  BLOCKED: "⚫",
  REVIEW: "🩷",
  TEAM_MEETING: "🟦",
  REMINDER: "🟢",
};

export const CALENDAR_STATUS_LABELS: Record<CalendarEventStatus, string> = {
  CONFIRMED: "מאושר",
  PENDING: "ממתין",
  DONE: "הסתיים",
  CANCELLED: "בוטל",
  NO_SHOW: "לא הגיע",
  RESCHEDULED: "נדחה",
};

export const CALENDAR_STATUS_DOT: Record<CalendarEventStatus, string> = {
  CONFIRMED: "bg-emerald-500",
  PENDING: "bg-amber-400",
  DONE: "bg-sky-500",
  CANCELLED: "bg-red-500",
  NO_SHOW: "bg-slate-700",
  RESCHEDULED: "bg-violet-500",
};

export const MANAGER_CALENDAR_KEY = "manager";

export const HOUR_START = 7;
export const HOUR_END = 21;
export const SLOT_MINUTES = 30;

/** Quick-pick colors for free-form calendar events (UI). */
export const EVENT_COLOR_PRESETS = [
  "#8b5cf6", // violet
  "#22c55e", // green
  "#3b82f6", // blue
  "#f97316", // orange
  "#ef4444", // red
  "#eab308", // yellow
  "#ec4899", // pink
  "#334155", // slate
] as const;

/** Internal type for user-created free-form events (not shown in create UI). */
export const DEFAULT_CUSTOM_EVENT_TYPE: CalendarEventType = "REMINDER";

export function eventColor(ev: Pick<CalendarEvent, "type" | "color">): string {
  return ev.color || CALENDAR_TYPE_COLORS[ev.type] || "#64748b";
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Week starts Sunday (Israel common calendar UX). */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function endOfWeek(d: Date): Date {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
}

export function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60000);
}

export function formatTimeHe(d: Date): string {
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateHe(d: Date): string {
  return d.toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Compact date label for dashboard upcoming list: היום / מחר / 29.08 */
export function formatUpcomingDayLabel(d: Date, now = new Date()): string {
  const day = startOfDay(d);
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  if (isSameDay(day, today)) return "היום";
  if (isSameDay(day, tomorrow)) return "מחר";
  const dd = String(day.getDate()).padStart(2, "0");
  const mm = String(day.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

export function formatUpcomingWhen(
  startsAt: Date,
  allDay: boolean,
  now = new Date(),
): string {
  const day = formatUpcomingDayLabel(startsAt, now);
  if (allDay) return `${day} · יום שלם`;
  return `${day} · ${formatTimeHe(startsAt)}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function snapToSlot(d: Date, slotMinutes = SLOT_MINUTES): Date {
  const x = new Date(d);
  const m = x.getMinutes();
  const snapped = Math.round(m / slotMinutes) * slotMinutes;
  x.setMinutes(snapped, 0, 0);
  return x;
}
