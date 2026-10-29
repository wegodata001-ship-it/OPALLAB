import type { SimpleStockKind } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { assertCanManageInventory, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import {
  createSimpleStockProduct,
  deleteSimpleStockItem,
  listSimpleStock,
  listSimpleStockHistory,
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
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get("kind"));
    if (url.searchParams.get("history") === "1") {
      const id = url.searchParams.get("id")?.trim();
      if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      return jsonOk({ history: await listSimpleStockHistory(id) });
    }
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
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const kind = parseKind(String(form.get("kind") ?? ""));
      const file = form.get("file");
      const minRaw = String(form.get("minQuantity") ?? "").trim();
      const quantityRaw = String(form.get("quantity") ?? "").trim();
      await createSimpleStockProduct({
        kind,
        name: String(form.get("name") ?? ""),
        quantity: quantityRaw === "" ? 0 : Number(quantityRaw),
        unit: String(form.get("unit") ?? ""),
        note: String(form.get("note") ?? ""),
        minQuantity: minRaw === "" ? null : Number(minRaw),
        barcode: String(form.get("barcode") ?? ""),
        image: file instanceof File && file.size > 0 ? { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type } : null,
        performedBy: user.id,
      });
      return jsonOk({ kind, items: await listSimpleStock(kind), canEdit: true });
    }
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      quantity?: number;
      unit?: string;
      note?: string;
      minQuantity?: number | null;
      barcode?: string;
    }>(request);
    const kind = parseKind(body.kind);
    await createSimpleStockProduct({
      kind,
      name: body.name ?? "",
      quantity: body.quantity,
      unit: body.unit,
      note: body.note,
      minQuantity: body.minQuantity,
      barcode: body.barcode,
      performedBy: user.id,
    });
    return jsonOk({ kind, items: await listSimpleStock(kind), canEdit: true });
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
      minQuantity?: number | null;
    }>(request);
    if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    await updateSimpleStockItem({
      id: body.id,
      name: body.name,
      quantity: body.quantity,
      unit: body.unit,
      note: body.note,
      delta: body.delta,
      minQuantity: body.minQuantity,
      performedBy: user.id,
    });
    const kind = await prisma.simpleStockItem.findUnique({ where: { id: body.id }, select: { kind: true } });
    const items = kind ? await listSimpleStock(kind.kind) : [];
    return jsonOk({ items, canEdit: true });
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
