import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import {
  canRecordProductionMaterial,
  isMaterialStage,
  listProductionMaterialHistory,
  listProductionMaterialUses,
  listZirconiaMaterialOptions,
  recordProductionMaterial,
  removeProductionMaterial,
  updateProductionMaterial,
  MATERIAL_STAGES,
} from "@/lib/workflow/material-usage";

async function viewer() {
  const user = await requireSessionUser();
  await assertModuleAccess(user, "workflow", "PRODUCTION_MATERIAL_USE");
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await viewer();
    const url = new URL(request.url);
    if (url.searchParams.get("options") === "1") {
      const allowed = MATERIAL_STAGES.some((stage) => canRecordProductionMaterial(user, stage));
      if (!allowed) throw new AppError("FORBIDDEN", "אין הרשאה לבחור חומר", 403);
      return jsonOk(await listZirconiaMaterialOptions());
    }
    const useId = url.searchParams.get("useId");
    if (useId) return jsonOk(await listProductionMaterialHistory(useId));
    return jsonOk(await listProductionMaterialUses(user, url.searchParams.get("orderId") || undefined));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await viewer();
    const body = await parseJsonBody<{ orderId?: string; stage?: string; heightId?: string; notes?: string }>(request);
    if (!body.orderId || !body.stage || !body.heightId) throw new AppError("VALIDATION_ERROR", "חסרים פרטי החומר", 400);
    if (!isMaterialStage(body.stage)) throw new AppError("VALIDATION_ERROR", "ניתן לתעד חומר רק בעיצוב או בהדפסה 3D", 400);
    return jsonOk(await recordProductionMaterial(user, { orderId: body.orderId, stage: body.stage, heightId: body.heightId, notes: body.notes }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await viewer();
    const body = await parseJsonBody<{ id?: string; heightId?: string; notes?: string }>(request);
    if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה תיעוד", 400);
    return jsonOk(await updateProductionMaterial(user, { id: body.id, heightId: body.heightId, notes: body.notes }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await viewer();
    const body = await parseJsonBody<{ id?: string }>(request);
    if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה תיעוד", 400);
    await removeProductionMaterial(user, body.id);
    return jsonOk({ removed: true });
  } catch (error) {
    return jsonError(error);
  }
}
