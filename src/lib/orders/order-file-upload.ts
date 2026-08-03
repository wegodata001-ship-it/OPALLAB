import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import {
  assertStorageObjectExists,
  createSignedUploadUrl,
  STORAGE_BUCKETS,
  uploadFile,
} from "@/lib/supabase/storage";
import {
  buildStructuredOrderFilePath,
  routingFromUploadSlot,
  type OrderFileCategory,
  type OrderFileSlotKey,
} from "@/lib/orders/order-file-taxonomy";
import { detectFileType, getMimeTypeFromFileName } from "@/lib/file-utils";
import { mapOrderFile } from "@/lib/mappers/prisma-to-app";
import type { OrderFile, OrderFileModelMeta } from "@/lib/types";
import type { Prisma } from "@prisma/client";

function parseSlotFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/slot:([a-z0-9_]+)/i);
  return m?.[1] ?? null;
}

export type PreparedOrderUpload = {
  fileId: string;
  storagePath: string;
  signedUrl: string;
  token: string;
  bucket: string;
  mimeType: string;
  fileType: OrderFile["fileType"];
  category: OrderFileCategory;
  slotKey: string;
  versionKey: string;
  version: number;
  replacesId: string | null;
};

export async function prepareOrderFileUpload(input: {
  orderId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string | null;
  notes?: string;
  uploadSlotId?: string | null;
  category?: OrderFileCategory;
  slotKey?: string;
  versionKey?: string;
  versionMode?: "new_version" | "replace";
}): Promise<PreparedOrderUpload> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

  const slotFromNotes = parseSlotFromNotes(input.notes);
  const routing = routingFromUploadSlot(input.uploadSlotId ?? slotFromNotes, input.fileName);
  const category = (input.category ?? routing.category) as OrderFileCategory;
  const slotKey = String(input.slotKey ?? (input.category ? "General" : routing.slotKey));
  const versionKey =
    input.versionKey ??
    (input.category && !input.uploadSlotId
      ? `${category}:${slotKey}:${input.fileName}`
      : routing.versionKey);

  const current = versionKey
    ? await prisma.orderFile.findFirst({
        where: { orderId: input.orderId, versionKey, isCurrent: true },
        orderBy: { version: "desc" },
      })
    : null;

  if (current && !input.versionMode) {
    throw new AppError("CONFLICT", "כבר קיים קובץ עם אותו שם", 409, {
      code: "FILE_VERSION_CONFLICT",
      existing: {
        id: current.id,
        fileName: current.fileName,
        version: current.version,
        category: current.category,
        slotKey: current.slotKey,
        uploadedAt: current.uploadedAt,
      },
    });
  }

  const nextVersion = current ? current.version + 1 : 1;
  const fileId = crypto.randomUUID();
  const storagePath = buildStructuredOrderFilePath({
    serialNumber: order.serialNumber,
    category,
    slotKey: slotKey as OrderFileSlotKey,
    version: nextVersion,
    fileName: input.fileName,
  });

  const mimeType =
    (input.mimeType && input.mimeType !== "application/octet-stream"
      ? input.mimeType
      : null) || getMimeTypeFromFileName(input.fileName);

  const signed = await createSignedUploadUrl(STORAGE_BUCKETS.ORDER_FILES, storagePath);

  return {
    fileId,
    storagePath,
    signedUrl: signed.signedUrl,
    token: signed.token,
    bucket: STORAGE_BUCKETS.ORDER_FILES,
    mimeType,
    fileType: detectFileType(input.fileName),
    category,
    slotKey,
    versionKey,
    version: nextVersion,
    replacesId: current?.id ?? null,
  };
}

export async function completeOrderFileUpload(input: {
  orderId: string;
  userId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: OrderFile["fileType"];
  storagePath: string;
  notes?: string;
  category: OrderFileCategory;
  slotKey: string;
  versionKey: string;
  version: number;
  replacesId?: string | null;
  modelMeta?: OrderFileModelMeta | null;
  /** PNG bytes for preview thumb — stored beside the mesh (not Base64 in DB). */
  thumbnailBuffer?: Buffer | null;
}): Promise<OrderFile> {
  // Storage → must exist before DB
  const stored = await assertStorageObjectExists(STORAGE_BUCKETS.ORDER_FILES, input.storagePath);
  const fileSize = stored.size > 0 ? stored.size : input.fileSize;

  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

  let thumbnailPath: string | null = null;
  if (input.thumbnailBuffer?.length && input.thumbnailBuffer.length < 800_000) {
    thumbnailPath = `${input.storagePath}.thumb.png`;
    await uploadFile(
      STORAGE_BUCKETS.ORDER_FILES,
      thumbnailPath,
      input.thumbnailBuffer,
      "image/png",
    );
  }

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    if (input.replacesId) {
      await tx.orderFile.updateMany({
        where: { id: input.replacesId, orderId: input.orderId },
        data: { isCurrent: false },
      });
    }

    const row = await tx.orderFile.create({
      data: {
        id: input.fileId,
        orderId: input.orderId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize,
        storagePath: input.storagePath,
        bucket: STORAGE_BUCKETS.ORDER_FILES,
        mimeType: input.mimeType || getMimeTypeFromFileName(input.fileName),
        uploadedBy: input.userId,
        notes: input.notes ?? null,
        category: input.category,
        slotKey: input.slotKey,
        versionKey: input.versionKey,
        version: input.version,
        isCurrent: true,
        replacesId: input.replacesId ?? null,
        modelMeta: (input.modelMeta ?? undefined) as Prisma.InputJsonValue | undefined,
        thumbnailPath,
        parsedAt: input.modelMeta ? now : null,
      },
    });

    if (order.status === "RECEIVED" || order.status === "FILES_ATTACHED") {
      if (order.status === "RECEIVED") {
        await tx.orderStatusHistory.create({
          data: {
            orderId: input.orderId,
            status: "FILES_ATTACHED",
            changedBy: input.userId,
            notes: `צורף: ${input.fileName} → ${input.category}/${input.slotKey}`,
          },
        });
      }
      await tx.order.update({
        where: { id: input.orderId },
        data: { status: "DESIGN", updatedAt: now },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: input.orderId,
          status: "DESIGN",
          changedBy: input.userId,
          notes: "התחלת ייצור — עיצוב",
        },
      });
    }

    const uploader = await tx.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    });
    return { row, uploaderName: uploader?.name };
  });

  return await mapOrderFile(created.row, created.uploaderName);
}

/** Legacy proxy upload (small files / fallback). Verifies storage after put. */
export async function uploadOrderFileViaProxy(input: {
  orderId: string;
  userId: string;
  fileName: string;
  fileType: OrderFile["fileType"];
  fileSize: number;
  mimeType: string;
  buffer: Buffer;
  notes?: string;
  uploadSlotId?: string | null;
  category?: OrderFileCategory;
  slotKey?: string;
  versionKey?: string;
  versionMode?: "new_version" | "replace";
}): Promise<OrderFile> {
  const prepared = await prepareOrderFileUpload({
    orderId: input.orderId,
    userId: input.userId,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
    notes: input.notes,
    uploadSlotId: input.uploadSlotId,
    category: input.category,
    slotKey: input.slotKey,
    versionKey: input.versionKey,
    versionMode: input.versionMode,
  });

  await uploadFile(
    STORAGE_BUCKETS.ORDER_FILES,
    prepared.storagePath,
    input.buffer,
    prepared.mimeType,
  );

  return completeOrderFileUpload({
    orderId: input.orderId,
    userId: input.userId,
    fileId: prepared.fileId,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: prepared.mimeType,
    fileType: prepared.fileType,
    storagePath: prepared.storagePath,
    notes: input.notes,
    category: prepared.category,
    slotKey: prepared.slotKey,
    versionKey: prepared.versionKey,
    version: prepared.version,
    replacesId: prepared.replacesId,
  });
}
