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
  listZirconiaCatalog,
  renameZirconiaNode,
  reorderZirconiaNodes,
  type ZirconiaCatalogKind,
} from "@/lib/inventory/zirconia-catalog";
import { canDeleteOrders } from "@/lib/user-roles";

function parseKind(kind: string | null | undefined): ZirconiaCatalogKind {
  if (kind === "model" || kind === "attribute" || kind === "value") return kind;
  throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
}

async function catalogPayload(userCanEdit: boolean) {
  return { canEdit: userCanEdit, models: await listZirconiaCatalog() };
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "ZIRCONIA_CATALOG_VIEW");
    return jsonOk(await catalogPayload(canDeleteOrders(user)));
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
      modelId?: string;
      attributeId?: string;
    }>(request);
    await createZirconiaNode({
      kind: parseKind(body.kind),
      name: body.name,
      modelId: body.modelId,
      attributeId: body.attributeId,
    });
    return jsonOk(await catalogPayload(true));
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
      orderedIds?: string[];
      modelId?: string;
      attributeId?: string;
    }>(request);
    const kind = parseKind(body.kind);
    if (body.orderedIds) {
      await reorderZirconiaNodes({
        kind,
        orderedIds: body.orderedIds,
        modelId: body.modelId,
        attributeId: body.attributeId,
      });
    } else {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await renameZirconiaNode({ kind, id: body.id, name: body.name });
    }
    return jsonOk(await catalogPayload(true));
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
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    await deleteZirconiaNode(parseKind(url.searchParams.get("kind")), id);
    return jsonOk(await catalogPayload(true));
  } catch (error) {
    return jsonError(error);
  }
}
