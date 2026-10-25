import type { InventoryModuleType } from "@prisma/client";

export const REMINDER_MODULES: InventoryModuleType[] = [
  "IMPLANTS",
  "TITANIUM",
  "DRILLS",
  "ZIRCONIA",
  "BMMA",
  "CLINIC_MATERIALS",
  "OTHER_MATERIALS",
  "DOCTOR_PARTS",
];

export const REMINDER_MODULE_LABELS: Record<InventoryModuleType, string> = {
  IMPLANTS: "מלאי שתלים",
  TITANIUM: "מלאי טיטניום",
  DRILLS: "מלאי מקדחים",
  ZIRCONIA: "מלאי זירקוניה",
  BMMA: "מלאי PMMA/BMMA",
  CLINIC_MATERIALS: "מלאי חומרים למרפאה",
  OTHER_MATERIALS: "מלאי חומרים שונים",
  DOCTOR_PARTS: "חלקים רופאים",
};

export const DEFAULT_FREQUENCY_DAYS = 30;
export const REMINDER_LEAD_DAYS = 2;
export const ESCALATION_AFTER_DAYS = 3;

export const ALERT_LABELS = {
  COUNT_UPCOMING: "ספירה מתקרבת",
  COUNT_DUE: "יום הספירה",
  COUNT_OVERDUE: "ספירה באיחור",
  COUNT_INCOMPLETE: "ספירה שלא הסתיימה",
  COUNT_ESCALATION: "הסלמה למנהל",
  LOW_STOCK: "חוסר במלאי",
  ZERO_STOCK: "כמות אפס",
  VARIANCE: "הפרש ספירה",
  NEVER_COUNTED: "פריטים ללא ספירה",
} as const;

export type AlertKindName = keyof typeof ALERT_LABELS;

export type CountTaskState = "PLANNED" | "DUE" | "IN_PROGRESS" | "PENDING_APPROVAL" | "COMPLETED" | "OVERDUE";

const TASK_LABELS: Record<CountTaskState, string> = {
  PLANNED: "מתוכננת",
  DUE: "ממתינה לביצוע",
  IN_PROGRESS: "בתהליך",
  PENDING_APPROVAL: "ממתינה לאישור",
  COMPLETED: "הושלמה",
  OVERDUE: "באיחור",
};

export function taskStatusLabel(status: CountTaskState): string {
  return TASK_LABELS[status];
}

export function jerusalemParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function dateKey(date: Date): string {
  const { year, month, day } = jerusalemParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 9, 0, 0));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function firstOfNextMonth(now: Date): Date {
  const { year, month } = jerusalemParts(now);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return fromDateKey(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`);
}

export function currentDueDate(anchor: Date, frequencyDays: number, now: Date): Date | null {
  const frequency = Math.trunc(frequencyDays);
  if (!Number.isInteger(frequency) || frequency < 1) return null;
  const horizon = addDays(now, REMINDER_LEAD_DAYS);
  let due = fromDateKey(dateKey(anchor));
  if (due.getTime() > horizon.getTime()) return null;
  let next = addDays(due, frequency);
  while (next.getTime() <= horizon.getTime()) {
    due = next;
    next = addDays(due, frequency);
  }
  return due;
}

export function overdueDayCount(due: Date, now: Date): number {
  const dueKey = dateKey(due);
  const nowKey = dateKey(now);
  if (nowKey <= dueKey) return 0;
  const dueDate = fromDateKey(dueKey);
  const nowDate = fromDateKey(nowKey);
  return Math.round((nowDate.getTime() - dueDate.getTime()) / 86_400_000);
}

export function taskState(input: {
  now: Date;
  due: Date;
  hasCount: boolean;
  countStatus?: "DRAFT" | "APPROVED" | "CANCELLED" | null;
  submitted: boolean;
  complete: boolean;
}): CountTaskState {
  if (input.complete) return "COMPLETED";
  if (input.submitted) return "PENDING_APPROVAL";
  if (input.hasCount && input.countStatus !== "CANCELLED") return "IN_PROGRESS";
  if (overdueDayCount(input.due, input.now) > 0) return "OVERDUE";
  if (dateKey(input.now) === dateKey(input.due)) return "DUE";
  return "PLANNED";
}

export function countLinesComplete(lines: { countedQuantity: number | null; skipReason: string; skipApproved: boolean }[]): boolean {
  return lines.length > 0 && lines.every((line) => line.countedQuantity !== null || (line.skipReason.trim().length > 0 && line.skipApproved));
}

export function linesReadyToSubmit(lines: { countedQuantity: number | null; skipReason: string }[]): boolean {
  return lines.length > 0 && lines.every((line) => line.countedQuantity !== null || line.skipReason.trim().length > 0);
}

export function shouldAlertLow(input: { alertsEnabled: boolean; minQuantity: number | null; quantity: number | null }): boolean {
  return input.alertsEnabled && input.minQuantity !== null && input.quantity !== null && input.quantity > 0 && input.quantity < input.minQuantity;
}

export function shouldAlertZero(input: { alertsEnabled: boolean; quantity: number | null }): boolean {
  return input.alertsEnabled && input.quantity === 0;
}

export function alertKindsForTask(input: {
  now: Date;
  due: Date;
  status: CountTaskState;
}): AlertKindName[] {
  if (input.status === "COMPLETED") return [];
  const kinds: AlertKindName[] = [];
  const daysUntil = overdueDayCount(input.due, input.now);
  const leadStart = dateKey(addDays(input.due, -REMINDER_LEAD_DAYS));
  if (dateKey(input.now) >= leadStart && dateKey(input.now) < dateKey(input.due) && input.status === "PLANNED") kinds.push("COUNT_UPCOMING");
  if (dateKey(input.now) === dateKey(input.due) && (input.status === "DUE" || input.status === "PLANNED")) kinds.push("COUNT_DUE");
  if (daysUntil > 0 && input.status !== "PENDING_APPROVAL") kinds.push("COUNT_OVERDUE");
  if (input.status === "IN_PROGRESS" || input.status === "PENDING_APPROVAL") kinds.push("COUNT_INCOMPLETE");
  if (daysUntil >= ESCALATION_AFTER_DAYS) kinds.push("COUNT_ESCALATION");
  return kinds;
}

export function shouldRecordDaily(eventDates: string[], now: Date): boolean {
  return !eventDates.includes(dateKey(now));
}

export function modulePath(type: InventoryModuleType) {
  const paths: Record<InventoryModuleType, string> = {
    ZIRCONIA: "/inventory/zirconia",
    TITANIUM: "/inventory/titanium",
    BMMA: "/inventory/bmma",
    DRILLS: "/inventory/drills",
    IMPLANTS: "/inventory/implants",
    CLINIC_MATERIALS: "/inventory/clinic-materials",
    OTHER_MATERIALS: "/inventory/misc-materials",
    DOCTOR_PARTS: "/inventory/doctor-parts",
  };
  return paths[type];
}

export function alertHref(input: { taskId?: string | null; inventoryType?: InventoryModuleType | null; itemId?: string | null; kind: AlertKindName }): string {
  const params = new URLSearchParams();
  if (input.taskId) params.set("task", input.taskId);
  if (input.inventoryType) params.set("type", input.inventoryType);
  if (input.itemId) params.set("item", input.itemId);
  params.set("kind", input.kind);
  return `/inventory/reminders?${params.toString()}`;
}
