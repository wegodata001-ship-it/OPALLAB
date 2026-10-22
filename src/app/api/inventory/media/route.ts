import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import { canEditInventoryCount } from "@/lib/inventory/inventory-count";
import {
  clearInventoryBarcode,
  deleteInventoryImage,
  generateInventoryBarcode,
  listInventoryMedia,
  lookupInventoryBarcode,
  setInventoryBarcode,
  setPrimaryInventoryImage,
  uploadInventoryImage,
} from "@/lib/inventory/inventory-media";
import { isMediaModule } from "@/lib/inventory/inventory-media-shared";
import { canAccessModule } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";

async function viewer() {
  const user = await requireSessionUser();
  await assertModuleAccess(user, "inventory", "INVENTORY_MEDIA_VIEW");
  return user;
}

function assertEditor(user: Awaited<ReturnType<typeof viewer>>, module: string) {
  if (!isMediaModule(module) || !canAccessModule(user, "inventory") || !canEditInventoryCount(user, module)) {
    throw new AppError("FORBIDDEN", "עריכת תמונות וברקודים זמינה למנהל בלבד", 403);
  }
}

export async function GET(request: Request) {
  try {
    await viewer();
    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim();
    if (code) return jsonOk({ match: await lookupInventoryBarcode(code) });
    const module = url.searchParams.get("module");
    if (!module) throw new AppError("VALIDATION_ERROR", "חסר סוג מלאי", 400);
    return jsonOk({ records: await listInventoryMedia(module) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await viewer();
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const module = String(form.get("module") ?? "");
      assertEditor(user, module);
      const file = form.get("file");
      if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "חסרה תמונה", 400);
      const imageId = await uploadInventoryImage({
        module,
        entityKind: String(form.get("entityKind") ?? ""),
        entityId: String(form.get("entityId") ?? ""),
        userId: user.id,
        bytes: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type,
        makePrimary: form.get("makePrimary") === "1",
      });
      return jsonOk({ imageId });
    }
    const body = await parseJsonBody<{
      action?: string;
      module?: string;
      entityKind?: string;
      entityId?: string;
      code?: string;
      imageId?: string;
    }>(request);
    if (body.action === "primary") {
      if (!body.imageId) throw new AppError("VALIDATION_ERROR", "חסרה תמונה", 400);
      const image = await prisma.inventoryImage.findUnique({ where: { id: body.imageId }, select: { module: true } });
      if (!image) throw new AppError("NOT_FOUND", "התמונה לא נמצאה", 404);
      assertEditor(user, image.module);
      await setPrimaryInventoryImage(body.imageId, user.id);
      return jsonOk({ ok: true });
    }
    const module = body.module ?? "";
    assertEditor(user, module);
    if (body.action === "barcode") {
      const code = await setInventoryBarcode({
        module,
        entityKind: body.entityKind ?? "",
        entityId: body.entityId ?? "",
        code: body.code ?? "",
        userId: user.id,
      });
      return jsonOk({ code });
    }
    if (body.action === "generate") {
      const code = await generateInventoryBarcode({
        module,
        entityKind: body.entityKind ?? "",
        entityId: body.entityId ?? "",
        userId: user.id,
      });
      return jsonOk({ code });
    }
    if (body.action === "clear-barcode") {
      await clearInventoryBarcode({
        module,
        entityKind: body.entityKind ?? "",
        entityId: body.entityId ?? "",
        userId: user.id,
      });
      return jsonOk({ ok: true });
    }
    throw new AppError("VALIDATION_ERROR", "פעולה לא תקינה", 400);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await viewer();
    const imageId = new URL(request.url).searchParams.get("imageId")?.trim();
    if (!imageId) throw new AppError("VALIDATION_ERROR", "חסרה תמונה", 400);
    const image = await prisma.inventoryImage.findUnique({ where: { id: imageId }, select: { module: true } });
    if (!image) throw new AppError("NOT_FOUND", "התמונה לא נמצאה", 404);
    assertEditor(user, image.module);
    await deleteInventoryImage(imageId, user.id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
