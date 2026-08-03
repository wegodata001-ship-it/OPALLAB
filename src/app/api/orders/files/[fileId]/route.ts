import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanUploadOrderFile, requireSessionUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { deleteFile, STORAGE_BUCKETS } from "@/lib/supabase/storage";
import type { OrderFileCategory } from "@/lib/orders/order-file-taxonomy";
import { mapOrderFile } from "@/lib/mappers/prisma-to-app";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertCanUploadOrderFile(user);
    const { fileId } = await context.params;

    const body = await parseJsonBody<{
      fileName?: string;
      category?: OrderFileCategory;
      slotKey?: string;
      notes?: string | null;
    }>(request);

    const existing = await prisma.orderFile.findUnique({ where: { id: fileId } });
    if (!existing) throw new AppError("NOT_FOUND", "קובץ לא נמצא", 404);

    const updated = await prisma.orderFile.update({
      where: { id: fileId },
      data: {
        ...(typeof body.fileName === "string" && body.fileName.trim()
          ? { fileName: body.fileName.trim() }
          : {}),
        ...(body.category ? { category: body.category } : {}),
        ...(typeof body.slotKey === "string" ? { slotKey: body.slotKey } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    const uploader = await prisma.user.findUnique({
      where: { id: updated.uploadedBy },
      select: { name: true },
    });

    return jsonOk({ file: await mapOrderFile(updated, uploader?.name) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertCanUploadOrderFile(user);
    const { fileId } = await context.params;

    const existing = await prisma.orderFile.findUnique({ where: { id: fileId } });
    if (!existing) throw new AppError("NOT_FOUND", "קובץ לא נמצא", 404);

    if (existing.storagePath) {
      try {
        await deleteFile(STORAGE_BUCKETS.ORDER_FILES, existing.storagePath);
      } catch (err) {
        console.warn("[api/orders/files] storage delete failed", err);
      }
    }

    await prisma.orderFile.delete({ where: { id: fileId } });
    return jsonOk({ deleted: true, fileId });
  } catch (error) {
    return jsonError(error);
  }
}
