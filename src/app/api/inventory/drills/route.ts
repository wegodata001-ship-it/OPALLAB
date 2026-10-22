import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageInventory, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import { createDrillBit, createDrillMachine, createDrillType, deleteDrillNode, listDrills, renameDrillNode } from "@/lib/inventory/drills";
import { AppError } from "@/lib/errors/app-error";

export async function GET() {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "DRILLS_VIEW");
    return jsonOk({ canEdit: isSystemAdminUser(user), machines: await listDrills() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "DRILLS_EDIT");
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{ kind?: string; name?: string; machineId?: string; typeId?: string; quantity?: number | null }>(request);
    if (body.kind === "machine") await createDrillMachine(body.name ?? "");
    else if (body.kind === "type") {
      if (!body.machineId) throw new AppError("VALIDATION_ERROR", "חסרה מכונה", 400);
      await createDrillType(body.machineId, body.name ?? "");
    } else if (body.kind === "bit") {
      if (!body.typeId) throw new AppError("VALIDATION_ERROR", "חסר סוג", 400);
      await createDrillBit(body.typeId, body.name ?? "", body.quantity === undefined ? null : body.quantity);
    } else throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    return jsonOk({ canEdit: true, machines: await listDrills() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "DRILLS_EDIT");
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{ kind?: string; id?: string; name?: string }>(request);
    if ((body.kind !== "machine" && body.kind !== "type" && body.kind !== "bit") || !body.id) {
      throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    }
    await renameDrillNode(body.kind, body.id, body.name ?? "");
    return jsonOk({ canEdit: true, machines: await listDrills() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "DRILLS_EDIT");
    await assertCanManageInventory(user);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id")?.trim();
    if ((kind !== "machine" && kind !== "type" && kind !== "bit") || !id) throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    const result = await deleteDrillNode(kind, id);
    return jsonOk({ canEdit: true, archived: result.archived, machines: await listDrills() });
  } catch (error) {
    return jsonError(error);
  }
}
