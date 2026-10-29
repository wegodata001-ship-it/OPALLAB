import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import {
  assertCanManageZirconiaCatalog,
  assertModuleAccess,
  requireSessionUser,
} from "@/lib/rbac";
import {
  createZirconiaNode,
  deleteZirconiaNode,
  renameZirconiaNode,
  reorderZirconiaNodes,
  type ZirconiaCatalogKind,
} from "@/lib/inventory/zirconia-catalog";
import {
  adjustZirconiaHeight,
  addZirconiaHeightColumn,
  createZirconiaColor,
  createZirconiaHeight,
  createZirconiaVariant,
  deleteZirconiaColor,
  deleteZirconiaHeight,
  deleteZirconiaHeightColumn,
  deleteZirconiaVariant,
  listZirconiaMovements,
  listZirconiaStock,
  renameZirconiaColor,
  renameZirconiaHeight,
  renameZirconiaHeightColumn,
  renameZirconiaVariant,
  reorderZirconiaVariants,
} from "@/lib/inventory/zirconia-stock";
import { canParticipateInInventoryCount } from "@/lib/inventory/inventory-count";
import { canDeleteOrders } from "@/lib/user-roles";

function parseCatalogKind(kind: string | null | undefined): ZirconiaCatalogKind {
  if (kind === "model" || kind === "attribute" || kind === "value") return kind;
  throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
}

async function stockPayload(user: Parameters<typeof canDeleteOrders>[0]) {
  return {
    canEdit: canDeleteOrders(user),
    canCount: canParticipateInInventoryCount(user, "ZIRCONIA"),
    models: await listZirconiaStock(),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "ZIRCONIA_CATALOG_VIEW");
    const url = new URL(request.url);
    if (url.searchParams.get("history") === "1") {
      const heightId = url.searchParams.get("heightId")?.trim();
      if (!heightId) throw new AppError("VALIDATION_ERROR", "חסר מזהה גובה", 400);
      return jsonOk({ movements: await listZirconiaMovements(heightId) });
    }
    return jsonOk(await stockPayload(user));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "ZIRCONIA_CATALOG");
    await assertCanManageZirconiaCatalog(user);
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      label?: string;
      modelId?: string;
      variantId?: string;
      colorId?: string;
      attributeId?: string;
      quantity?: number;
      minQuantity?: number | null;
      id?: string;
      ids?: string[];
      colorIds?: string[];
      delta?: number;
      reason?: string;
    }>(request);

    if (body.kind === "variant") {
      if (!body.modelId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
      await createZirconiaVariant({ modelId: body.modelId, name: body.name ?? "" });
    } else if (body.kind === "color") {
      if (!body.variantId && !body.modelId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
      await createZirconiaColor({ variantId: body.variantId, modelId: body.modelId, name: body.name ?? "" });
    } else if (body.kind === "height-column") {
      await addZirconiaHeightColumn({ colorIds: body.colorIds ?? [], label: body.label ?? "" });
    } else if (body.kind === "height") {
      if (!body.colorId) throw new AppError("VALIDATION_ERROR", "חסר צבע", 400);
      await createZirconiaHeight({
        colorId: body.colorId,
        label: body.label ?? "",
        quantity: body.quantity ?? Number.NaN,
        minQuantity: body.minQuantity,
        userId: user.id,
      });
    } else if (body.kind === "adjust" || body.kind === "count") {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await adjustZirconiaHeight({
        id: body.id,
        delta: body.kind === "adjust" ? body.delta : undefined,
        quantity: body.kind === "count" ? body.quantity : undefined,
        count: body.kind === "count",
        userId: user.id,
        reason: body.reason,
      });
    } else {
      await createZirconiaNode({
        kind: parseCatalogKind(body.kind),
        name: body.name,
        modelId: body.modelId,
        attributeId: body.attributeId,
      });
    }
    return jsonOk(await stockPayload(user));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "ZIRCONIA_CATALOG");
    await assertCanManageZirconiaCatalog(user);
    const body = await parseJsonBody<{
      kind?: string;
      id?: string;
      name?: string;
      label?: string;
      orderedIds?: string[];
      modelId?: string;
      attributeId?: string;
      quantity?: number;
      minQuantity?: number | null;
      ids?: string[];
      delta?: number;
      reason?: string;
    }>(request);

    if (body.kind === "variant") {
      if (body.orderedIds) {
        if (!body.modelId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
        await reorderZirconiaVariants(body.modelId, body.orderedIds);
      } else {
        if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
        await renameZirconiaVariant(body.id, body.name ?? "");
      }
    } else if (body.kind === "color") {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await renameZirconiaColor(body.id, body.name ?? "");
    } else if (body.kind === "height-column") {
      await renameZirconiaHeightColumn(body.ids ?? [], body.label ?? "");
    } else if (body.kind === "height") {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      if (body.delta !== undefined || (body.quantity !== undefined && body.label === undefined && body.minQuantity === undefined)) {
        await adjustZirconiaHeight({
          id: body.id,
          delta: body.delta,
          quantity: body.delta === undefined ? body.quantity : undefined,
          userId: user.id,
          reason: body.reason,
        });
      } else {
        await renameZirconiaHeight(body.id, body.label ?? "", body.minQuantity);
        if (body.quantity !== undefined) {
          await adjustZirconiaHeight({ id: body.id, quantity: body.quantity, userId: user.id, reason: body.reason });
        }
      }
    } else {
      const kind = parseCatalogKind(body.kind);
      if (body.orderedIds) {
        await reorderZirconiaNodes({ kind, orderedIds: body.orderedIds, modelId: body.modelId, attributeId: body.attributeId });
      } else {
        if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
        await renameZirconiaNode({ kind, id: body.id, name: body.name });
      }
    }
    return jsonOk(await stockPayload(user));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "ZIRCONIA_CATALOG");
    await assertCanManageZirconiaCatalog(user);
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const kind = url.searchParams.get("kind");
    let notice: string | null = null;
    if (kind === "height-column") {
      await deleteZirconiaHeightColumn((url.searchParams.get("ids") ?? "").split(","));
      return jsonOk(await stockPayload(user));
    }
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    if (kind === "variant") await deleteZirconiaVariant(id);
    else if (kind === "color") await deleteZirconiaColor(id);
    else if (kind === "height") {
      const result = await deleteZirconiaHeight(id);
      notice = result.archived ? "הגובה הוסר מהרשימה. היסטוריית הכמויות נשמרה." : null;
    } else await deleteZirconiaNode(parseCatalogKind(kind), id);
    return jsonOk({ ...(await stockPayload(user)), notice });
  } catch (error) {
    return jsonError(error);
  }
}
