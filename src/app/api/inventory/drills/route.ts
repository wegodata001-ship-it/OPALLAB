import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageInventory, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import {
  adjustDrillQuantity,
  createDrillBit,
  createDrillMachine,
  createDrillType,
  deleteDrillBit,
  deleteDrillNode,
  listDrills,
  renameDrillBit,
  renameDrillNode,
  setDrillActive,
} from "@/lib/inventory/drills";
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

async function editor() {
  const user = await requireSessionUser();
  await assertModuleAccess(user, "inventory", "DRILLS_EDIT");
  await assertCanManageInventory(user);
  return user;
}

export async function POST(request: Request) {
  try {
    const user = await editor();
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      description?: string;
      note?: string;
      machineId?: string;
      typeId?: string;
      bitId?: string;
      quantity?: number;
      delta?: number;
      barcode?: string;
      reason?: string;
      active?: boolean;
    }>(request);
    if (body.kind === "machine") await createDrillMachine({ name: body.name ?? "", description: body.description, active: body.active });
    else if (body.kind === "type") {
      if (!body.machineId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
      await createDrillType({ machineId: body.machineId, name: body.name ?? "", note: body.note });
    } else if (body.kind === "bit") {
      if (!body.typeId) throw new AppError("VALIDATION_ERROR", "חסר סוג חומר", 400);
      await createDrillBit({ typeId: body.typeId, label: body.name ?? "", quantity: body.quantity, barcode: body.barcode, userId: user.id });
    } else if (body.kind === "adjust") {
      if (!body.bitId) throw new AppError("VALIDATION_ERROR", "חסר פריט", 400);
      await adjustDrillQuantity({ bitId: body.bitId, delta: body.delta, quantity: body.quantity, reason: body.reason, userId: user.id });
    } else throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    return jsonOk({ canEdit: true, machines: await listDrills() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await editor();
    const body = await parseJsonBody<{ kind?: string; id?: string; name?: string; description?: string; active?: boolean }>(request);
    if (!body.id || (body.kind !== "machine" && body.kind !== "type" && body.kind !== "bit")) throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    if (body.kind === "bit") await renameDrillBit(body.id, body.name ?? "");
    else if (body.active !== undefined) await setDrillActive(body.kind, body.id, body.active);
    else await renameDrillNode(body.kind, body.id, body.name ?? "", body.description);
    return jsonOk({ canEdit: true, machines: await listDrills() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await editor();
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id")?.trim();
    if ((kind !== "machine" && kind !== "type" && kind !== "bit") || !id) throw new AppError("VALIDATION_ERROR", "סוג לא תקין", 400);
    const result = kind === "bit" ? await deleteDrillBit(id) : await deleteDrillNode(kind, id);
    return jsonOk({ canEdit: true, archived: result.archived, machines: await listDrills() });
  } catch (error) {
    return jsonError(error);
  }
}
