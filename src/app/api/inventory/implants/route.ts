import type { ImplantStockAction } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageInventory, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import {
  adjustImplantStock,
  createImplantBrand,
  createImplantHeight,
  createImplantModel,
  createImplantType,
  deleteImplantNode,
  getImplantCatalog,
  listImplantMovements,
  renameImplantBrand,
  renameImplantModel,
  renameImplantType,
  reorderImplant,
  restoreImplantNode,
  updateImplantHeight,
} from "@/lib/inventory/implant-catalog";

function parseKind(kind: string | null | undefined): "brand" | "model" | "type" | "height" {
  if (kind === "brand" || kind === "model" || kind === "type" || kind === "height") return kind;
  throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
}

function parseAction(value: string | undefined): ImplantStockAction {
  if (value === "IN" || value === "OUT" || value === "SET") return value;
  throw new AppError("VALIDATION_ERROR", "פעולת מלאי לא תקינה", 400);
}

async function payload(canEdit: boolean, notice?: string | null) {
  const catalog = await getImplantCatalog();
  return { canEdit, notice: notice ?? null, ...catalog };
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "IMPLANT_VIEW");
    const heightId = new URL(request.url).searchParams.get("heightId");
    if (heightId) return jsonOk({ movements: await listImplantMovements(heightId) });
    return jsonOk(await payload(isSystemAdminUser(user)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "IMPLANT_EDIT");
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      label?: string;
      parentId?: string;
      quantity?: number;
      minQuantity?: number;
      heightId?: string;
      action?: string;
      reason?: string;
    }>(request);

    if (body.kind === "stock") {
      if (!body.heightId) throw new AppError("VALIDATION_ERROR", "חסר גובה", 400);
      await adjustImplantStock({
        heightId: body.heightId,
        action: parseAction(body.action),
        quantity: body.quantity ?? -1,
        reason: body.reason,
        performedBy: user.id,
      });
    } else if (body.kind === "brand") {
      await createImplantBrand(body.name ?? "");
    } else if (body.kind === "model") {
      if (!body.parentId) throw new AppError("VALIDATION_ERROR", "חסרה חברה", 400);
      await createImplantModel(body.parentId, body.name ?? "");
    } else if (body.kind === "type") {
      if (!body.parentId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
      await createImplantType(body.parentId, body.name ?? "");
    } else if (body.kind === "height") {
      if (!body.parentId) throw new AppError("VALIDATION_ERROR", "חסר סוג", 400);
      await createImplantHeight({
        typeId: body.parentId,
        label: body.label ?? body.name ?? "",
        quantity: body.quantity,
        minQuantity: body.minQuantity,
        reason: body.reason,
        performedBy: user.id,
      });
    } else {
      throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    }

    return jsonOk(await payload(true));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "IMPLANT_EDIT");
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{
      kind?: string;
      id?: string;
      name?: string;
      label?: string;
      quantity?: number;
      minQuantity?: number;
      reason?: string;
      orderedIds?: string[];
      parentId?: string;
      restore?: boolean;
    }>(request);
    const kind = parseKind(body.kind);

    if (body.restore) {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await restoreImplantNode(kind, body.id);
    } else if (body.orderedIds) {
      await reorderImplant(kind, body.orderedIds, body.parentId);
    } else if (kind === "brand") {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await renameImplantBrand(body.id, body.name ?? "");
    } else if (kind === "model") {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await renameImplantModel(body.id, body.name ?? "");
    } else if (kind === "type") {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await renameImplantType(body.id, body.name ?? "");
    } else {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await updateImplantHeight({
        id: body.id,
        label: body.label ?? body.name,
        minQuantity: body.minQuantity,
        quantity: body.quantity,
        reason: body.reason,
        performedBy: user.id,
      });
    }

    return jsonOk(await payload(true));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "IMPLANT_EDIT");
    await assertCanManageInventory(user);
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get("kind"));
    const id = url.searchParams.get("id")?.trim();
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    const result = await deleteImplantNode(kind, id);
    return jsonOk(await payload(true, result.archived ? "הרשומה הועברה לארכיון כי קיים מלאי או היסטוריה." : null));
  } catch (error) {
    return jsonError(error);
  }
}
