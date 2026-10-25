import type { InventoryAlertKind, InventoryModuleType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { writeAuditLog } from "@/lib/audit-log";
import { canDeleteOrders, isSystemAdminUser } from "@/lib/user-roles";
import type { User } from "@prisma/client";
import {
  approveInventoryCount,
  canParticipateInInventoryCount,
  createInventoryCount,
  saveInventoryCount,
} from "@/lib/inventory/inventory-count";
import { listCountableItems } from "@/lib/inventory/inventory-count-items";
import { MEDIA_LEAF } from "@/lib/inventory/inventory-media-shared";
import { uploadInventoryImage } from "@/lib/inventory/inventory-media";
import {
  ALERT_LABELS,
  DEFAULT_FREQUENCY_DAYS,
  REMINDER_MODULE_LABELS,
  REMINDER_MODULES,
  alertHref,
  alertKindsForTask,
  countLinesComplete,
  currentDueDate,
  dateKey,
  firstOfNextMonth,
  linesReadyToSubmit,
  overdueDayCount,
  shouldAlertLow,
  shouldAlertZero,
  taskState,
  type AlertKindName,
  type CountTaskState,
} from "@/lib/inventory/inventory-reminder-rules";

const COUNT_KINDS: AlertKindName[] = ["COUNT_UPCOMING", "COUNT_DUE", "COUNT_OVERDUE", "COUNT_INCOMPLETE", "COUNT_ESCALATION"];

type RoleUser = Pick<User, "id" | "role" | "roles">;

export function canViewInventoryReminders(user: Pick<User, "role" | "roles">) {
  return isSystemAdminUser(user);
}

export function canManageInventoryReminders(user: Pick<User, "role" | "roles">) {
  return canDeleteOrders(user);
}

export function emailTransportStatus() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) {
    return { configured: false, reason: "לא נמצא שירות דוא״ל מוגדר בפרויקט" };
  }
  return { configured: false, reason: "הוגדרו פרטי דוא״ל, אבל אין בפרויקט ספריית שליחה פעילה" };
}

function assertViewer(user: RoleUser) {
  if (!canViewInventoryReminders(user)) throw new AppError("FORBIDDEN", "מרכז התראות המלאי זמין למנהל ולמזכירה", 403);
}

function assertManager(user: RoleUser) {
  if (!canManageInventoryReminders(user)) throw new AppError("FORBIDDEN", "הגדרת ספירות וסף מלאי זמינה למנהל בלבד", 403);
}

function cleanFrequency(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 365) throw new AppError("VALIDATION_ERROR", "תדירות הספירה צריכה להיות בין יום ל־365 יום", 400);
  return value;
}

async function upsertAlert(input: {
  dedupeKey: string;
  kind: InventoryAlertKind;
  severity: "INFO" | "WARNING" | "CRITICAL";
  audience: "MANAGER" | "SECRETARY" | "BOTH";
  inventoryType?: InventoryModuleType | null;
  taskId?: string | null;
  itemId?: string | null;
  title: string;
  body: string;
  href: string;
  overdueDays?: number;
  now: Date;
  daily?: boolean;
}) {
  const data = {
    kind: input.kind,
    severity: input.severity,
    audience: input.audience,
    inventoryType: input.inventoryType ?? null,
    taskId: input.taskId ?? null,
    itemId: input.itemId ?? null,
    title: input.title,
    body: input.body,
    href: input.href,
    overdueDays: input.overdueDays ?? 0,
    status: "OPEN",
    resolvedAt: null,
  };
  const existing = await prisma.inventoryAlert.findUnique({ where: { dedupeKey: input.dedupeKey }, include: { events: { orderBy: { createdAt: "desc" }, take: 20 } } });
  const alert = existing
    ? await prisma.inventoryAlert.update({ where: { id: existing.id }, data })
    : await prisma.inventoryAlert.create({ data: { ...data, dedupeKey: input.dedupeKey } });
  const marker = dateKey(input.now);
  const recorded = (existing?.events ?? []).some((event) => event.channel === "APP" && (event.detail.includes(marker) || dateKey(event.createdAt) === marker));
  const reopened = existing?.status === "RESOLVED";
  if (!existing || reopened || (input.daily && !recorded)) {
    const detail = reopened ? "ההתראה נפתחה מחדש" : existing ? "תזכורת יומית" : "נוצרה התראה";
    await prisma.inventoryAlertEvent.create({
      data: { alertId: alert.id, kind: input.kind, channel: "APP", detail: `${detail} · ${marker}` },
    });
  }
  return alert;
}

async function resolveAlert(dedupeKey: string) {
  await prisma.inventoryAlert.updateMany({
    where: { dedupeKey, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

export async function refreshInventoryTask(taskId: string, now = new Date()) {
  return syncTask(taskId, now);
}

async function syncTask(taskId: string, now: Date) {
  const task = await prisma.inventoryCountTask.findUnique({
    where: { id: taskId },
    include: { count: { include: { lines: true } } },
  });
  if (!task) return null;
  const lines = task.count?.lines ?? [];
  const views = lines.map((line) => ({ countedQuantity: line.countedQuantity, skipReason: line.skipReason, skipApproved: Boolean(line.skipApprovedAt) }));
  const complete = task.count?.status === "APPROVED" && countLinesComplete(views);
  const submitted = Boolean(task.submittedById) && !complete;
  const status = taskState({
    now,
    due: task.dueDate,
    hasCount: Boolean(task.count) && task.count?.status !== "CANCELLED",
    countStatus: task.count?.status ?? null,
    submitted,
    complete,
  });
  const overdueDays = status === "COMPLETED" ? task.overdueDays : overdueDayCount(task.dueDate, now);
  const saved = await prisma.inventoryCountTask.update({
    where: { id: task.id },
    data: {
      status,
      overdueDays,
      completedAt: complete ? task.completedAt ?? now : null,
    },
  });
  const label = REMINDER_MODULE_LABELS[task.inventoryType];
  const kinds = new Set(alertKindsForTask({ now, due: task.dueDate, status }));
  for (const kind of COUNT_KINDS) {
    const dedupeKey = `count:${kind}:${task.id}`;
    if (!kinds.has(kind)) {
      await resolveAlert(dedupeKey);
      continue;
    }
    const late = overdueDayCount(task.dueDate, now);
    await upsertAlert({
      dedupeKey,
      kind,
      severity: kind === "COUNT_ESCALATION" || kind === "COUNT_OVERDUE" ? "CRITICAL" : kind === "COUNT_INCOMPLETE" ? "WARNING" : "INFO",
      audience: kind === "COUNT_ESCALATION" ? "MANAGER" : "BOTH",
      inventoryType: task.inventoryType,
      taskId: task.id,
      title: late > 0 && (kind === "COUNT_OVERDUE" || kind === "COUNT_ESCALATION") ? `${ALERT_LABELS[kind]} · ${label} · ${late} ימים` : `${ALERT_LABELS[kind]} · ${label}`,
      body: `${label}. מועד ${dateKey(task.dueDate)}. סטטוס ${status}.`,
      href: alertHref({ taskId: task.id, inventoryType: task.inventoryType, kind }),
      overdueDays: late,
      now,
      daily: kind === "COUNT_OVERDUE" || kind === "COUNT_ESCALATION",
    });
  }
  if (complete) {
    await resolveAlert(`variance:${task.id}`);
    await prisma.inventoryAlert.updateMany({ where: { taskId: task.id, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: now } });
  }
  return saved;
}

async function syncStock(now: Date) {
  let low = 0;
  let zero = 0;
  let never = 0;
  for (const type of REMINDER_MODULES) {
    const items = await listCountableItems(type);
    const approved = await prisma.inventoryCountLine.findMany({
      where: { count: { inventoryType: type, status: "APPROVED" } },
      select: { itemId: true },
      distinct: ["itemId"],
    });
    const seen = new Set(approved.map((row) => row.itemId));
    const missing = items.filter((item) => !seen.has(item.id));
    const neverKey = `never:${type}`;
    if (missing.length > 0) {
      never += 1;
      await upsertAlert({
        dedupeKey: neverKey,
        kind: "NEVER_COUNTED",
        severity: "WARNING",
        audience: "BOTH",
        inventoryType: type,
        title: `${ALERT_LABELS.NEVER_COUNTED} · ${REMINDER_MODULE_LABELS[type]}`,
        body: `${missing.length} פריטים ללא ספירה מאושרת וללא תאריך ספירה אחרון.`,
        href: alertHref({ inventoryType: type, kind: "NEVER_COUNTED" }),
        now,
      });
    } else {
      await resolveAlert(neverKey);
    }
    const thresholds = await prisma.inventoryStockThreshold.findMany({ where: { inventoryType: type } });
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const threshold of thresholds) {
      const item = byId.get(threshold.itemId);
      const quantity = item?.quantity ?? null;
      const lowKey = `stock:low:${type}:${threshold.itemId}`;
      const zeroKey = `stock:zero:${type}:${threshold.itemId}`;
      if (item && shouldAlertZero({ alertsEnabled: threshold.alertsEnabled, quantity })) {
        zero += 1;
        await upsertAlert({
          dedupeKey: zeroKey,
          kind: "ZERO_STOCK",
          severity: "CRITICAL",
          audience: "BOTH",
          inventoryType: type,
          itemId: item.id,
          title: `${ALERT_LABELS.ZERO_STOCK} · ${item.name}`,
          body: `${REMINDER_MODULE_LABELS[type]}. כמות נוכחית 0${threshold.minQuantity !== null ? `. מינימום ${threshold.minQuantity}` : ""}.`,
          href: alertHref({ inventoryType: type, itemId: item.id, kind: "ZERO_STOCK" }),
          now,
          daily: true,
        });
      } else {
        await resolveAlert(zeroKey);
      }
      if (item && shouldAlertLow({ alertsEnabled: threshold.alertsEnabled, minQuantity: threshold.minQuantity, quantity })) {
        low += 1;
        await upsertAlert({
          dedupeKey: lowKey,
          kind: "LOW_STOCK",
          severity: "WARNING",
          audience: "BOTH",
          inventoryType: type,
          itemId: item.id,
          title: `${ALERT_LABELS.LOW_STOCK} · ${item.name}`,
          body: `${REMINDER_MODULE_LABELS[type]}. כמות נוכחית ${quantity}. מינימום ${threshold.minQuantity}.`,
          href: alertHref({ inventoryType: type, itemId: item.id, kind: "LOW_STOCK" }),
          now,
        });
      } else {
        await resolveAlert(lowKey);
      }
    }
  }
  return { low, zero, never };
}

export async function runInventoryReminders(input: { now?: Date; force?: boolean } = {}) {
  const now = input.now ?? new Date();
  const active = await prisma.inventoryReminderRun.findFirst({
    where: { status: "RUNNING", startedAt: { gt: new Date(now.getTime() - 10 * 60 * 1000) } },
    orderBy: { startedAt: "desc" },
  });
  if (active && !input.force) return { skipped: true, runId: active.id, email: emailTransportStatus() };
  const run = await prisma.inventoryReminderRun.create({ data: { status: "RUNNING", startedAt: now } });
  try {
    for (const type of REMINDER_MODULES) {
      const policy = await prisma.inventoryCountPolicy.findUnique({ where: { inventoryType: type } });
      if (!policy) {
        await prisma.inventoryCountPolicy.create({
          data: { inventoryType: type, frequencyDays: DEFAULT_FREQUENCY_DAYS, enabled: true, emailEnabled: false, anchorDate: firstOfNextMonth(now) },
        });
      }
    }
    const policies = await prisma.inventoryCountPolicy.findMany();
    let tasks = 0;
    for (const policy of policies) {
      if (!policy.enabled) continue;
      const due = currentDueDate(policy.anchorDate, policy.frequencyDays, now);
      if (!due) continue;
      const periodKey = dateKey(due);
      const existing = await prisma.inventoryCountTask.findUnique({ where: { inventoryType_periodKey: { inventoryType: policy.inventoryType, periodKey } } });
      const task = existing ?? await prisma.inventoryCountTask.create({
        data: { inventoryType: policy.inventoryType, periodKey, dueDate: due, status: "PLANNED" },
      });
      await syncTask(task.id, now);
      tasks += 1;
    }
    const stock = await syncStock(now);
    const email = emailTransportStatus();
    const summary = { tasks, ...stock, email };
    await prisma.inventoryReminderRun.update({ where: { id: run.id }, data: { status: "OK", finishedAt: new Date(), summary } });
    return { skipped: false, runId: run.id, summary, email };
  } catch (error) {
    await prisma.inventoryReminderRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: error instanceof Error ? error.message : "שגיאה בהרצת התזכורות" },
    });
    throw error;
  }
}

function visibleAlerts(user: RoleUser): Prisma.InventoryAlertWhereInput {
  if (canManageInventoryReminders(user)) return { status: "OPEN" };
  return {
    status: "OPEN",
    audience: { in: ["SECRETARY", "BOTH"] },
    OR: [{ taskId: null }, { task: { OR: [{ assignedToId: null }, { assignedToId: user.id }] } }],
  };
}

export async function reminderSummary(user: RoleUser) {
  assertViewer(user);
  const where = visibleAlerts(user);
  const [alerts, tasks] = await Promise.all([
    prisma.inventoryAlert.findMany({ where, select: { kind: true } }),
    prisma.inventoryCountTask.findMany({ select: { status: true, overdueDays: true } }),
  ]);
  return {
    open: alerts.length,
    planned: tasks.filter((task) => task.status === "PLANNED" || task.status === "DUE").length,
    overdue: tasks.filter((task) => task.status === "OVERDUE" || (task.overdueDays > 0 && task.status !== "COMPLETED")).length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length,
    low: alerts.filter((alert) => alert.kind === "LOW_STOCK").length,
    zero: alerts.filter((alert) => alert.kind === "ZERO_STOCK").length,
  };
}

export async function getReminderCenter(user: RoleUser) {
  assertViewer(user);
  const [policies, tasks, alerts, events, secretaries, replenishments, lastRun] = await Promise.all([
    prisma.inventoryCountPolicy.findMany({ orderBy: { inventoryType: "asc" } }),
    prisma.inventoryCountTask.findMany({ orderBy: { dueDate: "asc" }, include: { assignedTo: { select: { id: true, name: true } }, count: { select: { id: true, serial: true, status: true } } } }),
    prisma.inventoryAlert.findMany({ where: visibleAlerts(user), orderBy: { updatedAt: "desc" }, take: 200 }),
    prisma.inventoryAlertEvent.findMany({ orderBy: { createdAt: "desc" }, take: 80, include: { alert: { select: { title: true, kind: true, audience: true } } } }),
    prisma.user.findMany({ where: { isActive: true, OR: [{ role: "SECRETARY" }, { roles: { has: "SECRETARY" } }] }, select: { id: true, name: true } }),
    prisma.inventoryReplenishmentTask.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.inventoryReminderRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);
  return {
    canManage: canManageInventoryReminders(user),
    email: emailTransportStatus(),
    policies,
    tasks,
    alerts,
    secretaries,
    replenishments,
    lastRun,
    events: canManageInventoryReminders(user) ? events : events.filter((event) => event.alert.audience !== "MANAGER"),
    summary: await reminderSummary(user),
  };
}

export async function saveCountPolicy(user: RoleUser, input: { inventoryType: InventoryModuleType; frequencyDays: number; enabled: boolean; emailEnabled: boolean; anchorDate?: string }) {
  assertManager(user);
  if (!REMINDER_MODULES.includes(input.inventoryType)) throw new AppError("VALIDATION_ERROR", "קטגוריה לא תקינה", 400);
  const frequencyDays = cleanFrequency(input.frequencyDays);
  const anchorDate = input.anchorDate ? new Date(input.anchorDate) : undefined;
  if (anchorDate && Number.isNaN(anchorDate.getTime())) throw new AppError("VALIDATION_ERROR", "תאריך לא תקין", 400);
  const saved = await prisma.inventoryCountPolicy.upsert({
    where: { inventoryType: input.inventoryType },
    create: { inventoryType: input.inventoryType, frequencyDays, enabled: input.enabled, emailEnabled: input.emailEnabled, anchorDate: anchorDate ?? firstOfNextMonth(new Date()), updatedById: user.id },
    update: { frequencyDays, enabled: input.enabled, emailEnabled: input.emailEnabled, ...(anchorDate ? { anchorDate } : {}), updatedById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: "INVENTORY_COUNT_POLICY", entityType: "InventoryCountPolicy", entityId: saved.id, details: { inventoryType: input.inventoryType, frequencyDays, enabled: input.enabled, emailEnabled: input.emailEnabled } });
  return saved;
}

export async function saveStockThreshold(user: RoleUser, input: { inventoryType: InventoryModuleType; itemId: string; minQuantity: number | null; targetQuantity: number | null; alertsEnabled: boolean }) {
  assertManager(user);
  if (input.minQuantity !== null && (!Number.isInteger(input.minQuantity) || input.minQuantity < 0)) throw new AppError("VALIDATION_ERROR", "כמות מינימום אינה תקינה", 400);
  if (input.targetQuantity !== null && (!Number.isInteger(input.targetQuantity) || input.targetQuantity < 0)) throw new AppError("VALIDATION_ERROR", "כמות רצויה אינה תקינה", 400);
  const items = await listCountableItems(input.inventoryType);
  if (!items.some((item) => item.id === input.itemId)) throw new AppError("NOT_FOUND", "הפריט לא נמצא", 404);
  const saved = await prisma.inventoryStockThreshold.upsert({
    where: { inventoryType_itemId: { inventoryType: input.inventoryType, itemId: input.itemId } },
    create: { inventoryType: input.inventoryType, itemId: input.itemId, minQuantity: input.minQuantity, targetQuantity: input.targetQuantity, alertsEnabled: input.alertsEnabled, updatedById: user.id },
    update: { minQuantity: input.minQuantity, targetQuantity: input.targetQuantity, alertsEnabled: input.alertsEnabled, updatedById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: "INVENTORY_THRESHOLD", entityType: "InventoryStockThreshold", entityId: saved.id, details: { itemId: input.itemId, minQuantity: input.minQuantity, alertsEnabled: input.alertsEnabled } });
  return saved;
}

async function loadTask(taskId: string) {
  const task = await prisma.inventoryCountTask.findUnique({ where: { id: taskId }, include: { count: { include: { lines: true } } } });
  if (!task) throw new AppError("NOT_FOUND", "משימת הספירה לא נמצאה", 404);
  return task;
}

export async function assignCountTask(user: RoleUser, taskId: string, assignedToId: string | null) {
  assertManager(user);
  await loadTask(taskId);
  if (assignedToId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedToId, isActive: true } });
    if (!assignee || !isSystemAdminUser(assignee)) throw new AppError("VALIDATION_ERROR", "אפשר לשייך משימה למנהל או למזכירה", 400);
  }
  const saved = await prisma.inventoryCountTask.update({ where: { id: taskId }, data: { assignedToId } });
  await writeAuditLog({ userId: user.id, action: "INVENTORY_COUNT_ASSIGN", entityType: "InventoryCountTask", entityId: taskId, details: { assignedToId } });
  return saved;
}

export async function startCountTask(user: RoleUser, taskId: string) {
  assertViewer(user);
  const task = await loadTask(taskId);
  if (!canParticipateInInventoryCount(user, task.inventoryType)) throw new AppError("FORBIDDEN", "אין הרשאה להתחיל את הספירה", 403);
  if (task.status === "COMPLETED") throw new AppError("CONFLICT", "הספירה כבר הושלמה", 409);
  if (task.count && task.count.status !== "CANCELLED") return task;
  const count = await createInventoryCount({ type: task.inventoryType, userId: user.id, notes: `ספירת חובה ${task.periodKey}` });
  const saved = await prisma.inventoryCountTask.update({ where: { id: task.id }, data: { countId: count.id, startedById: user.id, status: "IN_PROGRESS" } });
  await writeAuditLog({ userId: user.id, action: "INVENTORY_COUNT_START", entityType: "InventoryCountTask", entityId: task.id, details: { countId: count.id } });
  await syncTask(task.id, new Date());
  return saved;
}

export async function saveCountTaskLines(user: RoleUser, taskId: string, lines: { itemId: string; countedQuantity: number | null; notes?: string; skipReason?: string }[]) {
  assertViewer(user);
  const task = await loadTask(taskId);
  if (!canParticipateInInventoryCount(user, task.inventoryType)) throw new AppError("FORBIDDEN", "אין הרשאה לעדכן את הספירה", 403);
  if (!task.count || task.count.status !== "DRAFT") throw new AppError("CONFLICT", "אפשר לעדכן רק ספירה פתוחה", 409);
  await saveInventoryCount({
    countId: task.count.id,
    lines: lines.map((line) => ({ itemId: line.itemId, countedQuantity: line.countedQuantity, notes: line.notes })),
  });
  for (const line of lines) {
    const reason = line.skipReason?.trim() ?? "";
    if (reason.length > 300) throw new AppError("VALIDATION_ERROR", "הסיבה ארוכה מדי", 400);
    await prisma.inventoryCountLine.updateMany({
      where: { countId: task.count.id, itemId: line.itemId },
      data: { skipReason: line.countedQuantity === null ? reason : "" },
    });
  }
  await writeAuditLog({ userId: user.id, action: "INVENTORY_COUNT_SAVE", entityType: "InventoryCountTask", entityId: task.id, details: { lines: lines.length } });
  return syncTask(task.id, new Date());
}

export async function submitCountTask(user: RoleUser, taskId: string) {
  assertViewer(user);
  const task = await loadTask(taskId);
  if (!canParticipateInInventoryCount(user, task.inventoryType)) throw new AppError("FORBIDDEN", "אין הרשאה לשלוח את הספירה", 403);
  if (!task.count || task.count.status !== "DRAFT") throw new AppError("CONFLICT", "הספירה אינה פתוחה לשליחה", 409);
  const ready = linesReadyToSubmit(task.count.lines.map((line) => ({ countedQuantity: line.countedQuantity, skipReason: line.skipReason })));
  if (!ready) throw new AppError("VALIDATION_ERROR", "אי אפשר לסמן ספירה כבוצעה בלי כמות או סיבה לכל פריט", 400);
  await prisma.inventoryCountTask.update({ where: { id: task.id }, data: { submittedById: user.id, status: "PENDING_APPROVAL" } });
  const variance = task.count.lines.filter((line) => line.countedQuantity !== null && line.countedQuantity !== (line.quantityAtStart ?? 0));
  if (variance.length > 0) {
    await upsertAlert({
      dedupeKey: `variance:${task.id}`,
      kind: "VARIANCE",
      severity: "WARNING",
      audience: "MANAGER",
      inventoryType: task.inventoryType,
      taskId: task.id,
      title: `${ALERT_LABELS.VARIANCE} · ${REMINDER_MODULE_LABELS[task.inventoryType]}`,
      body: `${variance.length} פריטים עם הפרש בין המערכת לספירה. המלאי לא עודכן עד אישור מנהל.`,
      href: alertHref({ taskId: task.id, inventoryType: task.inventoryType, kind: "VARIANCE" }),
      now: new Date(),
    });
  }
  await writeAuditLog({ userId: user.id, action: "INVENTORY_COUNT_SUBMIT", entityType: "InventoryCountTask", entityId: task.id, details: { variance: variance.length } });
  return syncTask(task.id, new Date());
}

export async function approveCountTask(user: RoleUser, taskId: string) {
  assertManager(user);
  const task = await loadTask(taskId);
  if (!task.count) throw new AppError("CONFLICT", "הספירה עדיין לא התחילה", 409);
  const ready = task.count.lines.every((line) => line.countedQuantity !== null || line.skipReason.trim().length > 0);
  if (!ready) throw new AppError("VALIDATION_ERROR", "אי אפשר לאשר ספירה בלי כמות או סיבה מאושרת לכל פריט", 400);
  if (task.count.status === "DRAFT") {
    const counted = task.count.lines.filter((line) => line.countedQuantity !== null);
    if (counted.length === 0) {
      await prisma.inventoryCount.update({
        where: { id: task.count.id },
        data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), countedItems: 0, changedItems: 0, unchangedItems: 0, differenceTotal: 0 },
      });
    } else {
      await approveInventoryCount({ countId: task.count.id, userId: user.id });
    }
  }
  await prisma.inventoryCountLine.updateMany({
    where: { countId: task.count.id, countedQuantity: null, skipReason: { not: "" }, skipApprovedAt: null },
    data: { skipApprovedAt: new Date(), skipApprovedById: user.id },
  });
  const late = overdueDayCount(task.dueDate, new Date());
  await prisma.inventoryCountTask.update({
    where: { id: task.id },
    data: { status: "COMPLETED", completedAt: new Date(), overdueDays: late },
  });
  await prisma.inventoryAlert.updateMany({ where: { taskId: task.id, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  await writeAuditLog({ userId: user.id, action: "INVENTORY_COUNT_APPROVE_TASK", entityType: "InventoryCountTask", entityId: task.id, details: { countId: task.count.id } });
  return syncTask(task.id, new Date());
}

export async function createReplenishmentTask(user: RoleUser, input: { inventoryType: InventoryModuleType; itemId: string }) {
  assertViewer(user);
  const items = await listCountableItems(input.inventoryType);
  const item = items.find((row) => row.id === input.itemId);
  if (!item) throw new AppError("NOT_FOUND", "הפריט לא נמצא", 404);
  const threshold = await prisma.inventoryStockThreshold.findUnique({ where: { inventoryType_itemId: { inventoryType: input.inventoryType, itemId: input.itemId } } });
  const created = await prisma.inventoryReplenishmentTask.create({
    data: { inventoryType: input.inventoryType, itemId: input.itemId, itemName: item.name, quantity: item.quantity, minQuantity: threshold?.minQuantity ?? null, createdById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: "INVENTORY_REPLENISHMENT", entityType: "InventoryReplenishmentTask", entityId: created.id, details: { itemId: input.itemId, quantity: item.quantity } });
  return created;
}

export async function getCountTaskDetail(user: RoleUser, taskId: string) {
  assertViewer(user);
  const task = await loadTask(taskId);
  if (!canManageInventoryReminders(user) && task.assignedToId && task.assignedToId !== user.id) {
    throw new AppError("FORBIDDEN", "המשימה משויכת למשתמש אחר", 403);
  }
  return task;
}

export async function attachCountPhoto(user: RoleUser, taskId: string, itemId: string, bytes: Buffer, mimeType: string) {
  assertViewer(user);
  const task = await loadTask(taskId);
  if (!canParticipateInInventoryCount(user, task.inventoryType)) throw new AppError("FORBIDDEN", "אין הרשאה להעלות תמונה לספירה", 403);
  if (!task.count || task.count.status !== "DRAFT") throw new AppError("CONFLICT", "אפשר להעלות תמונה רק לספירה פתוחה", 409);
  if (!task.count.lines.some((line) => line.itemId === itemId)) throw new AppError("VALIDATION_ERROR", "הפריט אינו שייך לספירה", 400);
  const imageId = await uploadInventoryImage({
    module: task.inventoryType,
    entityKind: MEDIA_LEAF[task.inventoryType],
    entityId: itemId,
    userId: user.id,
    bytes,
    mimeType,
  });
  await writeAuditLog({ userId: user.id, action: "INVENTORY_COUNT_PHOTO", entityType: "InventoryCountTask", entityId: task.id, details: { itemId, imageId } });
  return imageId;
}

export async function maybeRunReminders() {
  const latest = await prisma.inventoryReminderRun.findFirst({ where: { status: "OK" }, orderBy: { startedAt: "desc" } });
  if (latest && Date.now() - latest.startedAt.getTime() < 6 * 60 * 60 * 1000) return { skipped: true, runId: latest.id };
  return runInventoryReminders();
}
