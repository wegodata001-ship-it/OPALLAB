import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageInventory, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import {
  adjustBmmaStock,
  createBmmaColor,
  createBmmaHeight,
  createBmmaModel,
  deleteBmmaNode,
  getBmmaCatalog,
  listBmmaMovements,
  renameBmmaCategory,
  renameBmmaModel,
  reorderBmma,
  restoreBmmaNode,
  updateBmmaColor,
  updateBmmaHeight,
} from "@/lib/inventory/bmma-catalog";
import type { BmmaStockAction } from "@prisma/client";

function parseAction(value: string | undefined): BmmaStockAction {
  if (value === "IN" || value === "OUT" || value === "SET") return value;
  throw new AppError("VALIDATION_ERROR", "פעולת מלאי לא תקינה", 400);
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "BMMA_VIEW");
    const heightId = new URL(request.url).searchParams.get("heightId");
    if (heightId) return jsonOk({ movements: await listBmmaMovements(heightId) });
    const catalog = await getBmmaCatalog();
    return jsonOk({ ...catalog, canEdit: isSystemAdminUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "BMMA_EDIT");
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      label?: string;
      colorCode?: string;
      modelId?: string | null;
      colorId?: string;
      minQuantity?: number;
      heightId?: string;
      action?: string;
      quantity?: number;
      reason?: string;
    }>(request);

    if (body.kind === "stock") {
      if (!body.heightId) throw new AppError("VALIDATION_ERROR", "חסר גובה", 400);
      await adjustBmmaStock({
        heightId: body.heightId,
        action: parseAction(body.action),
        quantity: body.quantity ?? -1,
        reason: body.reason,
        performedBy: user.id,
      });
    } else if (body.kind === "model") {
      await createBmmaModel(body.name ?? "");
    } else if (body.kind === "color") {
      await createBmmaColor({ name: body.name ?? "", colorCode: body.colorCode, modelId: body.modelId });
    } else if (body.kind === "height") {
      if (!body.colorId) throw new AppError("VALIDATION_ERROR", "חסר צבע", 400);
      await createBmmaHeight({ colorId: body.colorId, label: body.label ?? body.name ?? "", minQuantity: body.minQuantity });
    } else {
      throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    }

    const catalog = await getBmmaCatalog();
    return jsonOk({ ...catalog, canEdit: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "BMMA_EDIT");
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{
      kind?: string;
      id?: string;
      name?: string;
      colorCode?: string;
      label?: string;
      minQuantity?: number;
      orderedIds?: string[];
      modelId?: string | null;
      colorId?: string;
      restore?: boolean;
    }>(request);

    if (body.restore && (body.kind === "model" || body.kind === "color" || body.kind === "height")) {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await restoreBmmaNode(body.kind, body.id);
    } else if (body.kind === "category") {
      await renameBmmaCategory(body.name ?? "");
    } else if (body.kind === "model") {
      if (body.orderedIds) await reorderBmma({ kind: "model", orderedIds: body.orderedIds });
      else {
        if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
        await renameBmmaModel(body.id, body.name ?? "");
      }
    } else if (body.kind === "color") {
      if (body.orderedIds) await reorderBmma({ kind: "color", orderedIds: body.orderedIds, modelId: body.modelId });
      else {
        if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
        await updateBmmaColor({ id: body.id, name: body.name, colorCode: body.colorCode });
      }
    } else if (body.kind === "height") {
      if (body.restore) {
        if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
        await restoreBmmaNode("height", body.id);
      } else if (body.orderedIds) {
        await reorderBmma({ kind: "height", orderedIds: body.orderedIds, colorId: body.colorId });
      } else {
        if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
        await updateBmmaHeight({ id: body.id, label: body.label ?? body.name, minQuantity: body.minQuantity });
      }
    } else {
      throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    }

    const catalog = await getBmmaCatalog();
    return jsonOk({ ...catalog, canEdit: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "BMMA_EDIT");
    await assertCanManageInventory(user);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id")?.trim();
    if (kind !== "model" && kind !== "color" && kind !== "height") {
      throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    }
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    const result = await deleteBmmaNode(kind, id);
    const catalog = await getBmmaCatalog();
    return jsonOk({
      ...catalog,
      canEdit: true,
      notice: result.archived ? "הרשומה הועברה לארכיון כי קיימות תנועות מלאי או יתרה." : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
