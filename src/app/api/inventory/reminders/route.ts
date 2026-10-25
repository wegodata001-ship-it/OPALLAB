import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { parseInventoryModuleType } from "@/lib/inventory/inventory-count";
import { listCountableItems } from "@/lib/inventory/inventory-count-items";
import { prisma } from "@/lib/prisma";
import {
  approveCountTask,
  assignCountTask,
  attachCountPhoto,
  canViewInventoryReminders,
  createReplenishmentTask,
  getCountTaskDetail,
  getReminderCenter,
  maybeRunReminders,
  reminderSummary,
  saveCountPolicy,
  saveCountTaskLines,
  saveStockThreshold,
  startCountTask,
  submitCountTask,
} from "@/lib/inventory/inventory-reminders";

async function viewer() {
  const user = await requireSessionUser();
  await assertModuleAccess(user, "inventory", "INVENTORY_REMINDERS");
  if (!canViewInventoryReminders(user)) throw new AppError("FORBIDDEN", "מרכז התראות המלאי זמין למנהל ולמזכירה", 403);
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await viewer();
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    if (view === "bell" || view === "summary") return jsonOk(await reminderSummary(user));
    const taskId = url.searchParams.get("task")?.trim();
    if (taskId) return jsonOk({ task: await getCountTaskDetail(user, taskId) });
    const itemsType = url.searchParams.get("items");
    if (itemsType) {
      const type = parseInventoryModuleType(itemsType);
      const [items, thresholds] = await Promise.all([
        listCountableItems(type),
        prisma.inventoryStockThreshold.findMany({ where: { inventoryType: type } }),
      ]);
      return jsonOk({ items, thresholds });
    }
    const sync = await maybeRunReminders().catch((error: unknown) => ({ failed: error instanceof Error ? error.message : "שגיאה בסנכרון" }));
    const center = await getReminderCenter(user);
    return jsonOk({ ...center, sync });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await viewer();
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "חסרה תמונה", 400);
      const imageId = await attachCountPhoto(user, String(form.get("taskId") ?? ""), String(form.get("itemId") ?? ""), Buffer.from(await file.arrayBuffer()), file.type);
      return jsonOk({ imageId });
    }
    const body = await parseJsonBody<{
      action?: string;
      inventoryType?: string;
      frequencyDays?: number;
      enabled?: boolean;
      emailEnabled?: boolean;
      anchorDate?: string;
      itemId?: string;
      minQuantity?: number | null;
      targetQuantity?: number | null;
      alertsEnabled?: boolean;
      taskId?: string;
      assignedToId?: string | null;
      lines?: { itemId: string; countedQuantity: number | null; notes?: string; skipReason?: string }[];
    }>(request);
    if (body.action === "sync") {
      const result = await maybeRunReminders();
      return jsonOk(result);
    }
    if (body.action === "policy") {
      const saved = await saveCountPolicy(user, {
        inventoryType: parseInventoryModuleType(body.inventoryType),
        frequencyDays: body.frequencyDays ?? 30,
        enabled: Boolean(body.enabled),
        emailEnabled: Boolean(body.emailEnabled),
        anchorDate: body.anchorDate,
      });
      return jsonOk({ policy: saved });
    }
    if (body.action === "threshold") {
      if (!body.itemId) throw new AppError("VALIDATION_ERROR", "חסר פריט", 400);
      const saved = await saveStockThreshold(user, {
        inventoryType: parseInventoryModuleType(body.inventoryType),
        itemId: body.itemId,
        minQuantity: body.minQuantity ?? null,
        targetQuantity: body.targetQuantity ?? null,
        alertsEnabled: Boolean(body.alertsEnabled),
      });
      return jsonOk({ threshold: saved });
    }
    if (!body.taskId && body.action !== "replenish") throw new AppError("VALIDATION_ERROR", "חסרה משימה", 400);
    if (body.action === "assign") return jsonOk({ task: await assignCountTask(user, body.taskId ?? "", body.assignedToId ?? null) });
    if (body.action === "start") return jsonOk({ task: await startCountTask(user, body.taskId ?? "") });
    if (body.action === "save") return jsonOk({ task: await saveCountTaskLines(user, body.taskId ?? "", body.lines ?? []) });
    if (body.action === "submit") {
      if (body.lines) await saveCountTaskLines(user, body.taskId ?? "", body.lines);
      return jsonOk({ task: await submitCountTask(user, body.taskId ?? "") });
    }
    if (body.action === "approve") {
      if (body.lines) await saveCountTaskLines(user, body.taskId ?? "", body.lines);
      return jsonOk({ task: await approveCountTask(user, body.taskId ?? "") });
    }
    if (body.action === "replenish") {
      if (!body.itemId) throw new AppError("VALIDATION_ERROR", "חסר פריט", 400);
      return jsonOk({ task: await createReplenishmentTask(user, { inventoryType: parseInventoryModuleType(body.inventoryType), itemId: body.itemId }) });
    }
    throw new AppError("VALIDATION_ERROR", "פעולה לא תקינה", 400);
  } catch (error) {
    return jsonError(error);
  }
}
