import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { canAccessModule } from "@/lib/permissions";
import {
  adjustCountableItem,
  approveInventoryCount,
  canEditInventoryCount,
  canParticipateInInventoryCount,
  cancelInventoryCount,
  createInventoryCount,
  getInventoryCount,
  listInventoryCounts,
  listItemCountHistory,
  listItemMovements,
  saveItemCountDraft,
  parseInventoryModuleType,
  refreshInventoryCount,
  saveInventoryCount,
} from "@/lib/inventory/inventory-count";
import { AppError } from "@/lib/errors/app-error";

async function viewer(typeRaw: string | null) {
  const user = await requireSessionUser();
  await assertModuleAccess(user, "inventory", "INVENTORY_COUNT_VIEW");
  const type = parseInventoryModuleType(typeRaw);
  const canEdit = canAccessModule(user, "inventory") && canEditInventoryCount(user, type);
  const canCount = canAccessModule(user, "inventory") && canParticipateInInventoryCount(user, type);
  return { user, type, canEdit, canCount };
}

async function editor(typeRaw: string | null) {
  const viewed = await viewer(typeRaw);
  if (!viewed.canEdit) throw new AppError("FORBIDDEN", "עריכת ספירת מלאי זמינה למנהל בלבד", 403);
  return viewed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { type, canEdit, canCount } = await viewer(url.searchParams.get("type"));
    if (url.searchParams.get("history") === "1") {
      const itemId = url.searchParams.get("itemId")?.trim();
      if (!itemId) throw new AppError("VALIDATION_ERROR", "חסר פריט", 400);
      return jsonOk({ canEdit, canCount, movements: await listItemMovements(type, itemId) });
    }
    if (url.searchParams.get("itemCounts") === "1") {
      const itemId = url.searchParams.get("itemId")?.trim();
      if (!itemId) throw new AppError("VALIDATION_ERROR", "חסר פריט", 400);
      return jsonOk({ canEdit, canCount, counts: await listItemCountHistory(type, itemId) });
    }
    const countId = url.searchParams.get("countId")?.trim();
    if (countId) return jsonOk({ canEdit, canCount, count: await getInventoryCount(countId) });
    return jsonOk({ canEdit, canCount, ...(await listInventoryCounts(type)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      action?: string;
      type?: string;
      countId?: string;
      itemId?: string;
      itemIds?: string[];
      delta?: number;
      countedQuantity?: number;
      notes?: string;
      counterName?: string;
      location?: string;
      lines?: { itemId: string; countedQuantity: number | null; notes?: string }[];
    }>(request);
    if (body.action === "adjust") {
      const { user, type } = await editor(body.type ?? null);
      if (!body.itemId || body.delta === undefined) throw new AppError("VALIDATION_ERROR", "חסרה כמות", 400);
      await adjustCountableItem({ type, itemId: body.itemId, delta: body.delta, userId: user.id });
      return jsonOk({ canEdit: true, ...(await listInventoryCounts(type)) });
    }
    if (body.action === "count-item") {
      const viewed = await viewer(body.type ?? null);
      if (!viewed.canCount) throw new AppError("FORBIDDEN", "ספירת מלאי זמינה למשתמש עם הרשאת מלאי", 403);
      if (!body.itemId || body.countedQuantity === undefined) throw new AppError("VALIDATION_ERROR", "חסרה כמות שנספרה", 400);
      const itemCount = await saveItemCountDraft({
        type: viewed.type,
        itemId: body.itemId,
        countedQuantity: body.countedQuantity,
        userId: viewed.user.id,
      });
      return jsonOk({ canEdit: viewed.canEdit, canCount: true, itemCount });
    }
    if (body.action === "create") {
      const viewed = await viewer(body.type ?? null);
      if (!viewed.canCount) throw new AppError("FORBIDDEN", "ספירת מלאי זמינה למשתמש עם הרשאת מלאי", 403);
      const { user, type } = viewed;
      const count = await createInventoryCount({
        type,
        itemIds: body.itemIds,
        notes: body.notes,
        counterName: body.counterName,
        location: body.location,
        userId: user.id,
      });
      return jsonOk({ canEdit: true, count });
    }
    if (body.action === "save" || body.action === "approve" || body.action === "cancel" || body.action === "refresh") {
      if (!body.countId) throw new AppError("VALIDATION_ERROR", "חסרה ספירה", 400);
      const user = await requireSessionUser();
      await assertModuleAccess(user, "inventory", "INVENTORY_COUNT");
      const current = await getInventoryCount(body.countId);
      const manager = canEditInventoryCount(user, current.inventoryType);
      const counter = canParticipateInInventoryCount(user, current.inventoryType) && canAccessModule(user, "inventory");
      if (body.action === "approve" && !manager) throw new AppError("FORBIDDEN", "אישור ספירה זמין למנהל בלבד", 403);
      if (!counter) throw new AppError("FORBIDDEN", "עריכת ספירת מלאי זמינה למנהל בלבד", 403);
      if (body.action === "save") {
        const count = await saveInventoryCount({
          countId: body.countId,
          notes: body.notes,
          counterName: body.counterName,
          location: body.location,
          lines: body.lines ?? [],
        });
        return jsonOk({ canEdit: true, count });
      }
      if (body.action === "approve") return jsonOk({ canEdit: true, count: await approveInventoryCount({ countId: body.countId, userId: user.id }) });
      if (body.action === "refresh") return jsonOk({ canEdit: true, count: await refreshInventoryCount(body.countId) });
      return jsonOk({ canEdit: true, count: await cancelInventoryCount(body.countId) });
    }
    throw new AppError("VALIDATION_ERROR", "פעולה לא תקינה", 400);
  } catch (error) {
    return jsonError(error);
  }
}
