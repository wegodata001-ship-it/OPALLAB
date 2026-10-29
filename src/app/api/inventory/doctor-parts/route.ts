import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import {
  countDoctorPart,
  createDoctorPartProduct,
  deleteDoctorPart,
  doctorPartSummary,
  listDoctorPartMovements,
  listDoctorParts,
  updateDoctorPart,
} from "@/lib/inventory/doctor-parts";
import { assertCanManageInventory, requireSessionUser } from "@/lib/rbac";
import { canCreateOrders, canEditOrders } from "@/lib/permissions";
import { canAccessModule } from "@/lib/permissions";
import { isSystemAdminUser } from "@/lib/user-roles";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("VALIDATION_ERROR", "תאריך אינו תקין", 400);
  return date;
}

async function assertCanView(user: Awaited<ReturnType<typeof requireSessionUser>>) {
  if (canAccessModule(user, "inventory") || canCreateOrders(user) || canEditOrders(user)) return;
  throw new AppError("FORBIDDEN", "אין הרשאה לצפות בחלקים", 403);
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanView(user);
    const url = new URL(request.url);
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));
    const partId = url.searchParams.get("partId") ?? undefined;
    if (url.searchParams.get("history") === "1") {
      return jsonOk({ movements: await listDoctorPartMovements({ partId, from, to }) });
    }
    const [parts, summary] = await Promise.all([listDoctorParts(), doctorPartSummary(from, to)]);
    return jsonOk({ parts, summary, canEdit: isSystemAdminUser(user) && canAccessModule(user, "inventory") });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanManageInventory(user);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const quantityRaw = String(form.get("quantity") ?? "").trim();
      const minRaw = String(form.get("minQuantity") ?? "").trim();
      await createDoctorPartProduct({
        name: String(form.get("name") ?? ""),
        code: String(form.get("code") ?? ""),
        quantity: quantityRaw === "" ? 0 : Number(quantityRaw),
        unit: String(form.get("unit") ?? ""),
        notes: String(form.get("notes") ?? ""),
        minQuantity: minRaw === "" ? null : Number(minRaw),
        barcode: String(form.get("barcode") ?? ""),
        image: file instanceof File && file.size > 0 ? { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type } : null,
        userId: user.id,
      });
      return jsonOk({ parts: await listDoctorParts(), canEdit: true });
    }
    const body = await parseJsonBody<{
      kind?: string;
      name?: string;
      code?: string;
      quantity?: number;
      unit?: string;
      notes?: string;
      minQuantity?: number | null;
      barcode?: string;
      id?: string;
      physicalQuantity?: number;
      reason?: string;
    }>(request);
    if (body.kind === "count") {
      if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
      await countDoctorPart({
        id: body.id,
        physicalQuantity: body.physicalQuantity ?? Number.NaN,
        userId: user.id,
        reason: body.reason,
      });
    } else {
      await createDoctorPartProduct({
        name: body.name ?? "",
        code: body.code,
        quantity: body.quantity,
        unit: body.unit,
        notes: body.notes,
        minQuantity: body.minQuantity,
        barcode: body.barcode,
        userId: user.id,
        reason: body.reason,
      });
    }
    const parts = await listDoctorParts();
    return jsonOk({ parts, canEdit: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanManageInventory(user);
    const body = await parseJsonBody<{
      id?: string;
      name?: string;
      code?: string;
      unit?: string;
      notes?: string;
      quantity?: number;
      delta?: number;
      minQuantity?: number | null;
      reason?: string;
    }>(request);
    if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    await updateDoctorPart({ ...body, id: body.id, userId: user.id });
    const parts = await listDoctorParts();
    return jsonOk({ parts, canEdit: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanManageInventory(user);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    const result = await deleteDoctorPart(id);
    const parts = await listDoctorParts();
    return jsonOk({
      parts,
      canEdit: true,
      notice: result.archived ? "החלק הועבר לארכיון כי קיימת היסטוריה או הזמנות." : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
