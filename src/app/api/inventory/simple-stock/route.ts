import type { SimpleStockKind } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { assertCanManageInventory, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import {
  createSimpleStockItem,
  deleteSimpleStockItem,
  listSimpleStock,
  updateSimpleStockItem,
} from "@/lib/inventory/simple-stock";

function parseKind(value: string | null | undefined): SimpleStockKind {
  if (value === "CLINIC_MATERIALS" || value === "OTHER_MATERIALS") return value;
  throw new AppError("VALIDATION_ERROR", "סוג מלאי לא תקין", 400);
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "SIMPLE_STOCK_VIEW");
    const kind = parseKind(new URL(request.url).searchParams.get("kind"));
    const items = await listSimpleStock(kind);
    return jsonOk({ kind, items, canEdit: isSystemAdminUser(user) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "SIMPLE_STOCK_EDIT");
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      quantity?: number;
      unit?: string;
      note?: string;
    }>(request);
    const kind = parseKind(body.kind);
    await createSimpleStockItem({
      kind,
      name: body.name ?? "",
      quantity: body.quantity,
      unit: body.unit,
      note: body.note,
      performedBy: user.id,
    });
    const items = await listSimpleStock(kind);
    return jsonOk({ kind, items, canEdit: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "SIMPLE_STOCK_EDIT");
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{
      id?: string;
      name?: string;
      quantity?: number;
      unit?: string;
      note?: string;
      delta?: number;
    }>(request);
    if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    await updateSimpleStockItem({
      id: body.id,
      name: body.name,
      quantity: body.quantity,
      unit: body.unit,
      note: body.note,
      delta: body.delta,
      performedBy: user.id,
    });
    const existing = await prisma.simpleStockItem.findUnique({ where: { id: body.id }, select: { kind: true } });
    if (!existing) throw new AppError("NOT_FOUND", "המוצר לא נמצא", 404);
    const items = await listSimpleStock(existing.kind);
    return jsonOk({ kind: existing.kind, items, canEdit: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "SIMPLE_STOCK_EDIT");
    await assertCanManageInventory(user);
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const kind = parseKind(url.searchParams.get("kind"));
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    await deleteSimpleStockItem(id);
    const items = await listSimpleStock(kind);
    return jsonOk({ kind, items, canEdit: true });
  } catch (error) {
    return jsonError(error);
  }
}
