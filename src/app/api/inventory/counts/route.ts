import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { canAccessModule } from "@/lib/permissions";
import {
  adjustCountableItem,
  approveInventoryCount,
  canEditInventoryCount,
  cancelInventoryCount,
  createInventoryCount,
  getInventoryCount,
  listInventoryCounts,
  listItemMovements,
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
  return { user, type, canEdit };
}

async function editor(typeRaw: string | null) {
  const viewed = await viewer(typeRaw);
  if (!viewed.canEdit) throw new AppError("FORBIDDEN", "עריכת ספירת מלאי זמינה למנהל בלבד", 403);
  return viewed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { type, canEdit } = await viewer(url.searchParams.get("type"));
    if (url.searchParams.get("history") === "1") {
      const itemId = url.searchParams.get("itemId")?.trim();
      if (!itemId) throw new AppError("VALIDATION_ERROR", "חסר פריט", 400);
      return jsonOk({ canEdit, movements: await listItemMovements(type, itemId) });
    }
    const countId = url.searchParams.get("countId")?.trim();
    if (countId) return jsonOk({ canEdit, count: await getInventoryCount(countId) });
    return jsonOk({ canEdit, ...(await listInventoryCounts(type)) });
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
    if (body.action === "create") {
      const { user, type } = await editor(body.type ?? null);
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
      if (!canEditInventoryCount(user, current.inventoryType)) throw new AppError("FORBIDDEN", "עריכת ספירת מלאי זמינה למנהל בלבד", 403);
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
