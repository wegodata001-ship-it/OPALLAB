import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import {
  assertCanManageTitaniumCatalog,
  assertModuleAccess,
  requireSessionUser,
} from "@/lib/rbac";
import { canDeleteOrders } from "@/lib/user-roles";
import { setInventoryBarcode, uploadInventoryImage } from "@/lib/inventory/inventory-media";
import {
  adjustTitaniumQuantity,
  createTitaniumNode,
  deleteTitaniumNode,
  discardNewTitaniumRadius,
  discardNewTitaniumSize,
  getTitaniumCatalog,
  renameTitaniumNode,
  reorderTitaniumNodes,
  restoreTitaniumNode,
  updateTitaniumCategory,
  type TitaniumCatalogKind,
} from "@/lib/inventory/titanium-catalog";

function parseKind(kind: string | null | undefined): TitaniumCatalogKind {
  if (kind === "category" || kind === "model" || kind === "radius" || kind === "size") return kind;
  throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
}

async function payload(canEdit: boolean, notice?: string) {
  const catalog = await getTitaniumCatalog();
  return { canEdit, notice: notice ?? null, ...catalog };
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "TITANIUM_CATALOG_VIEW");
    return jsonOk(await payload(canDeleteOrders(user)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "TITANIUM_CATALOG");
    await assertCanManageTitaniumCatalog(user);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const kind = String(form.get("kind") ?? "");
      if (kind !== "radius" && kind !== "size") throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
      const file = form.get("file");
      const id = await createTitaniumNode({
        kind,
        name: String(form.get("name") ?? ""),
        modelId: String(form.get("modelId") ?? "") || undefined,
        radiusId: String(form.get("radiusId") ?? "") || undefined,
      });
      try {
        if (file instanceof File && file.size > 0) {
          await uploadInventoryImage({
            module: "TITANIUM",
            entityKind: kind,
            entityId: id,
            userId: user.id,
            bytes: Buffer.from(await file.arrayBuffer()),
            mimeType: file.type,
            makePrimary: true,
          });
        }
        const barcode = String(form.get("barcode") ?? "").trim();
        if (barcode) await setInventoryBarcode({ module: "TITANIUM", entityKind: kind, entityId: id, code: barcode, userId: user.id });
      } catch (error) {
        if (kind === "radius") await discardNewTitaniumRadius(id);
        else await discardNewTitaniumSize(id);
        throw error;
      }
      return jsonOk(await payload(true));
    }
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      modelId?: string;
      radiusId?: string;
      barcode?: string;
      id?: string;
      delta?: number;
      quantity?: number;
      count?: boolean;
      reason?: string;
    }>(request);
    if (body.kind === "stock") {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await adjustTitaniumQuantity({
        id: body.id,
        delta: body.delta,
        quantity: body.quantity,
        count: body.count,
        reason: body.reason,
        userId: user.id,
      });
      return jsonOk(await payload(true));
    }
    const kind = parseKind(body.kind);
    if (kind === "category") throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    const id = await createTitaniumNode({ kind, name: body.name, modelId: body.modelId, radiusId: body.radiusId });
    if (body.barcode?.trim() && (kind === "radius" || kind === "size")) {
      try {
        await setInventoryBarcode({ module: "TITANIUM", entityKind: kind, entityId: id, code: body.barcode, userId: user.id });
      } catch (error) {
        if (kind === "radius") await discardNewTitaniumRadius(id);
        else await discardNewTitaniumSize(id);
        throw error;
      }
    }
    return jsonOk(await payload(true));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "TITANIUM_CATALOG");
    await assertCanManageTitaniumCatalog(user);
    const body = await parseJsonBody<{
      kind?: string;
      id?: string;
      name?: string;
      details?: string;
      hubSortOrder?: number;
      orderedIds?: string[];
      modelId?: string;
      radiusId?: string;
      archive?: boolean;
      restore?: boolean;
    }>(request);
    const kind = parseKind(body.kind);

    if (kind === "category") {
      const result = await updateTitaniumCategory({
        name: body.name,
        details: body.details,
        hubSortOrder: body.hubSortOrder,
        archive: body.archive,
        restore: body.restore,
      });
      return jsonOk(await payload(true, result.archived ? "הקטגוריה הועברה לארכיון והנתונים נשמרו." : undefined));
    }

    if (body.restore) {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await restoreTitaniumNode(kind, body.id);
      return jsonOk(await payload(true, "הרשומה שוחזרה מהארכיון."));
    }

    if (body.orderedIds) {
      await reorderTitaniumNodes({
        kind,
        orderedIds: body.orderedIds,
        modelId: body.modelId,
        radiusId: body.radiusId,
      });
      return jsonOk(await payload(true));
    }

    if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    await renameTitaniumNode({ kind, id: body.id, name: body.name });
    return jsonOk(await payload(true));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "TITANIUM_CATALOG");
    await assertCanManageTitaniumCatalog(user);
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get("kind"));
    if (kind === "category") {
      const result = await updateTitaniumCategory({ archive: true });
      return jsonOk(await payload(true, result.archived ? "הקטגוריה הועברה לארכיון והנתונים נשמרו." : undefined));
    }
    const id = url.searchParams.get("id")?.trim();
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    const result = await deleteTitaniumNode(kind, id);
    const notice = result.archived
      ? "הרשומה הועברה לארכיון כי קיימים נתונים מקושרים."
      : undefined;
    return jsonOk(await payload(true, notice));
  } catch (error) {
    return jsonError(error);
  }
}
