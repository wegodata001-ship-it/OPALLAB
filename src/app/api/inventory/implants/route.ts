import type { ImplantStockAction } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageInventory, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import { canParticipateInInventoryCount } from "@/lib/inventory/inventory-count";
import { setInventoryBarcode, uploadInventoryImage } from "@/lib/inventory/inventory-media";
import {
  adjustImplantStock,
  createImplantBrand,
  createImplantHeight,
  createImplantModel,
  createImplantType,
  deleteImplantNode,
  discardNewImplantHeight,
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

async function payload(user: Parameters<typeof canParticipateInInventoryCount>[0], notice?: string | null) {
  const catalog = await getImplantCatalog();
  return {
    canEdit: isSystemAdminUser(user),
    canCount: canParticipateInInventoryCount(user, "IMPLANTS"),
    notice: notice ?? null,
    ...catalog,
  };
}

async function attachNewHeightMedia(id: string, userId: string, barcode: string, file: File | null) {
  try {
    if (file && file.size > 0) {
      await uploadInventoryImage({
        module: "IMPLANTS",
        entityKind: "height",
        entityId: id,
        userId,
        bytes: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        makePrimary: true,
      });
    }
    if (barcode.trim()) {
      await setInventoryBarcode({ module: "IMPLANTS", entityKind: "height", entityId: id, code: barcode, userId });
    }
  } catch (error) {
    await discardNewImplantHeight(id);
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "IMPLANT_VIEW");
    const heightId = new URL(request.url).searchParams.get("heightId");
    if (heightId) return jsonOk({ movements: await listImplantMovements(heightId) });
    return jsonOk(await payload(user));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "IMPLANT_EDIT");
    await assertCanManageInventory(user);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (String(form.get("kind") ?? "") !== "height") throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
      const parentId = String(form.get("parentId") ?? "");
      if (!parentId) throw new AppError("VALIDATION_ERROR", "חסר סוג", 400);
      const quantityRaw = String(form.get("quantity") ?? "").trim();
      const minRaw = String(form.get("minQuantity") ?? "").trim();
      const file = form.get("file");
      const id = await createImplantHeight({
        typeId: parentId,
        label: String(form.get("label") ?? ""),
        unit: String(form.get("unit") ?? ""),
        notes: String(form.get("notes") ?? ""),
        quantity: quantityRaw === "" ? 0 : Number(quantityRaw),
        minQuantity: minRaw === "" ? 0 : Number(minRaw),
        reason: String(form.get("reason") ?? ""),
        performedBy: user.id,
      });
      await attachNewHeightMedia(id, user.id, String(form.get("barcode") ?? ""), file instanceof File ? file : null);
      return jsonOk(await payload(user));
    }
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      label?: string;
      unit?: string;
      notes?: string;
      barcode?: string;
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
      const id = await createImplantHeight({
        typeId: body.parentId,
        label: body.label ?? body.name ?? "",
        unit: body.unit,
        notes: body.notes,
        quantity: body.quantity,
        minQuantity: body.minQuantity,
        reason: body.reason,
        performedBy: user.id,
      });
      await attachNewHeightMedia(id, user.id, body.barcode ?? "", null);
    } else {
      throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    }

    return jsonOk(await payload(user));
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
      unit?: string;
      notes?: string;
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
        unit: body.unit,
        notes: body.notes,
        minQuantity: body.minQuantity,
        quantity: body.quantity,
        reason: body.reason,
        performedBy: user.id,
      });
    }

    return jsonOk(await payload(user));
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
    return jsonOk(await payload(user, result.archived ? "הרשומה הועברה לארכיון כי קיים מלאי או היסטוריה." : null));
  } catch (error) {
    return jsonError(error);
  }
}
