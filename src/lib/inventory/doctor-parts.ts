import { Prisma, type DoctorPartMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { mergeDoctorPartSelections, type DoctorPartSelection } from "@/lib/inventory/doctor-parts-rules";

type Tx = Prisma.TransactionClient;

export type DoctorPartRow = {
  id: string;
  name: string;
  code: string;
  quantity: number;
  unit: string;
  notes: string;
  minQuantity: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DoctorPartMovementRow = {
  id: string;
  partId: string;
  partName: string;
  orderId: string | null;
  orderSerial: string;
  operationId: string;
  type: DoctorPartMovementType;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  userId: string;
  userName: string;
  reason: string;
  source: string;
  createdAt: string;
};

const NAME_MAX = 120;

function cleanName(raw: string | undefined): string {
  const name = raw?.trim() ?? "";
  if (!name) throw new AppError("VALIDATION_ERROR", "חסר שם חלק", 400);
  if (name.length > NAME_MAX) throw new AppError("VALIDATION_ERROR", "שם החלק ארוך מדי", 400);
  return name;
}

function cleanText(raw: string | undefined, max: number, label: string): string {
  const value = raw?.trim() ?? "";
  if (value.length > max) throw new AppError("VALIDATION_ERROR", `${label} ארוך מדי`, 400);
  return value;
}

function mapPart(row: {
  id: string;
  name: string;
  code: string;
  quantity: number;
  unit: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}, minQuantity: number | null): DoctorPartRow {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    quantity: row.quantity,
    unit: row.unit,
    notes: row.notes,
    minQuantity,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDoctorParts(): Promise<DoctorPartRow[]> {
  const rows = await prisma.doctorPart.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });
  const thresholds = rows.length === 0 ? [] : await prisma.inventoryStockThreshold.findMany({
    where: { inventoryType: "DOCTOR_PARTS", itemId: { in: rows.map((row) => row.id) } },
    select: { itemId: true, minQuantity: true },
  });
  const mins = new Map(thresholds.map((row) => [row.itemId, row.minQuantity]));
  return rows.map((row) => mapPart(row, mins.get(row.id) ?? null));
}

export async function doctorPartSummary(from?: Date, to?: Date) {
  const parts = await prisma.doctorPart.findMany({
    where: { archivedAt: null },
    select: { quantity: true },
  });
  const movementCount = await prisma.doctorPartMovement.count({
    where: {
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
  });
  return {
    partCount: parts.length,
    totalQuantity: parts.reduce((sum, part) => sum + part.quantity, 0),
    negativeCount: parts.filter((part) => part.quantity < 0).length,
    movementCount,
  };
}

export async function listDoctorPartMovements(input?: {
  partId?: string;
  from?: Date;
  to?: Date;
}): Promise<DoctorPartMovementRow[]> {
  const rows = await prisma.doctorPartMovement.findMany({
    where: {
      ...(input?.partId ? { partId: input.partId } : {}),
      ...(input?.from || input?.to
        ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { part: { select: { name: true } }, user: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    partId: row.partId,
    partName: row.part.name,
    orderId: row.orderId,
    orderSerial: row.orderSerial,
    operationId: row.operationId,
    type: row.type,
    quantityChange: row.quantityChange,
    quantityBefore: row.quantityBefore,
    quantityAfter: row.quantityAfter,
    userId: row.userId,
    userName: row.user.name,
    reason: row.reason,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function writeMovement(
  tx: Tx,
  input: {
    partId: string;
    orderId?: string | null;
    orderSerial?: string;
    operationId: string;
    type: DoctorPartMovementType;
    quantityChange: number;
    quantityBefore: number;
    quantityAfter: number;
    userId: string;
    reason?: string;
    source: "ORDER" | "MANUAL";
  },
) {
  await tx.doctorPartMovement.create({
    data: {
      partId: input.partId,
      orderId: input.orderId ?? null,
      orderSerial: input.orderSerial ?? "",
      operationId: input.operationId,
      type: input.type,
      quantityChange: input.quantityChange,
      quantityBefore: input.quantityBefore,
      quantityAfter: input.quantityAfter,
      userId: input.userId,
      reason: input.reason?.trim() ?? "",
      source: input.source,
    },
  });
}

function movementKey(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function cleanMin(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new AppError("VALIDATION_ERROR", "כמות המינימום אינה תקינה", 400);
  return value;
}

async function saveMinQuantity(partId: string, minQuantity: number | null, userId: string) {
  if (minQuantity === null) {
    await prisma.inventoryStockThreshold.deleteMany({ where: { inventoryType: "DOCTOR_PARTS", itemId: partId } });
    return;
  }
  await prisma.inventoryStockThreshold.upsert({
    where: { inventoryType_itemId: { inventoryType: "DOCTOR_PARTS", itemId: partId } },
    create: { inventoryType: "DOCTOR_PARTS", itemId: partId, minQuantity, alertsEnabled: minQuantity > 0, updatedById: userId },
    update: { minQuantity, alertsEnabled: minQuantity > 0, updatedById: userId },
  });
}

export async function createDoctorPart(input: {
  name: string;
  code?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  userId: string;
  reason?: string;
}): Promise<string> {
  const name = cleanName(input.name);
  const quantity = input.quantity ?? 0;
  if (!Number.isInteger(quantity)) throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  return prisma.$transaction(async (tx) => {
    const part = await tx.doctorPart.create({
      data: {
        name,
        code: cleanText(input.code, 40, "קוד החלק"),
        quantity,
        unit: cleanText(input.unit, 40, "יחידת המידה"),
        notes: cleanText(input.notes, 500, "ההערה"),
      },
    });
    if (quantity !== 0) {
      await writeMovement(tx, {
        partId: part.id,
        operationId: `create:${part.id}`,
        type: quantity > 0 ? "STOCK_IN" : "STOCK_OUT",
        quantityChange: quantity,
        quantityBefore: 0,
        quantityAfter: quantity,
        userId: input.userId,
        reason: input.reason ?? "פתיחת חלק",
        source: "MANUAL",
      });
    }
    return part.id;
  });
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6_000_000;

export async function discardNewDoctorPart(id: string): Promise<void> {
  const linked = await prisma.orderPart.count({ where: { partId: id } });
  if (linked > 0) throw new AppError("CONFLICT", "החלק משויך להזמנה ולא נמחק", 409);
  const { deleteFile } = await import("@/lib/supabase/storage");
  const { STORAGE_BUCKETS } = await import("@/lib/supabase/admin");
  const images = await prisma.inventoryImage.findMany({ where: { module: "DOCTOR_PARTS", entityKind: "part", entityId: id } });
  for (const image of images) {
    await deleteFile(STORAGE_BUCKETS.INVENTORY_IMAGES, image.storagePath).catch(() => undefined);
  }
  await prisma.inventoryImage.deleteMany({ where: { module: "DOCTOR_PARTS", entityKind: "part", entityId: id } });
  await prisma.inventoryScanCode.deleteMany({ where: { module: "DOCTOR_PARTS", entityKind: "part", entityId: id } });
  await prisma.inventoryStockThreshold.deleteMany({ where: { inventoryType: "DOCTOR_PARTS", itemId: id } });
  await prisma.doctorPartMovement.deleteMany({ where: { partId: id } });
  await prisma.doctorPart.deleteMany({ where: { id } });
}

export async function createDoctorPartProduct(input: {
  name: string;
  code?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
  minQuantity?: number | null;
  barcode?: string;
  image?: { bytes: Buffer; mimeType: string } | null;
  userId: string;
  reason?: string;
}): Promise<string> {
  const barcode = input.barcode?.trim() ?? "";
  if (barcode) {
    const [scan, classic] = await Promise.all([
      prisma.inventoryScanCode.findUnique({ where: { code: barcode }, select: { id: true } }),
      prisma.inventoryItem.findFirst({ where: { barcode }, select: { id: true } }),
    ]);
    if (scan || classic) throw new AppError("CONFLICT", "הברקוד כבר משויך לפריט אחר", 409);
  }
  if (input.image) {
    if (!IMAGE_TYPES.has(input.image.mimeType)) throw new AppError("VALIDATION_ERROR", "אפשר להעלות JPG, PNG או WEBP", 400);
    if (input.image.bytes.byteLength === 0 || input.image.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new AppError("VALIDATION_ERROR", "גודל התמונה גדול מדי", 400);
    }
  }
  const minQuantity = cleanMin(input.minQuantity);
  const id = await createDoctorPart(input);
  try {
    if (input.image) {
      const { uploadInventoryImage } = await import("@/lib/inventory/inventory-media");
      await uploadInventoryImage({
        module: "DOCTOR_PARTS",
        entityKind: "part",
        entityId: id,
        userId: input.userId,
        bytes: input.image.bytes,
        mimeType: input.image.mimeType,
        makePrimary: true,
      });
    }
    if (barcode) {
      const { setInventoryBarcode } = await import("@/lib/inventory/inventory-media");
      await setInventoryBarcode({ module: "DOCTOR_PARTS", entityKind: "part", entityId: id, code: barcode, userId: input.userId });
    }
    if (minQuantity !== undefined) await saveMinQuantity(id, minQuantity, input.userId);
  } catch (error) {
    await discardNewDoctorPart(id).catch(() => undefined);
    throw error;
  }
  return id;
}

type StockMove = { quantityBefore: number; quantityAfter: number };

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** One statement so concurrent updates cannot both read the same balance. */
async function adjustDoctorPartQuantity(tx: Tx, partId: string, delta: number): Promise<StockMove | null> {
  const rows = await tx.$queryRaw<Array<{ quantityBefore: number; quantityAfter: number }>>`
    WITH locked AS (
      SELECT id, quantity FROM "DoctorPart" WHERE id = ${partId} FOR UPDATE
    )
    UPDATE "DoctorPart" AS part
    SET quantity = locked.quantity + ${delta}, "updatedAt" = CURRENT_TIMESTAMP
    FROM locked
    WHERE part.id = locked.id
    RETURNING locked.quantity AS "quantityBefore", part.quantity AS "quantityAfter"
  `;
  const row = rows[0];
  if (!row) return null;
  return { quantityBefore: Number(row.quantityBefore), quantityAfter: Number(row.quantityAfter) };
}

async function setDoctorPartQuantity(tx: Tx, partId: string, next: number): Promise<StockMove | null> {
  const rows = await tx.$queryRaw<Array<{ quantityBefore: number; quantityAfter: number }>>`
    WITH locked AS (
      SELECT id, quantity FROM "DoctorPart" WHERE id = ${partId} FOR UPDATE
    )
    UPDATE "DoctorPart" AS part
    SET quantity = ${next}, "updatedAt" = CURRENT_TIMESTAMP
    FROM locked
    WHERE part.id = locked.id AND locked.quantity <> ${next}
    RETURNING locked.quantity AS "quantityBefore", part.quantity AS "quantityAfter"
  `;
  const row = rows[0];
  if (!row) return null;
  return { quantityBefore: Number(row.quantityBefore), quantityAfter: Number(row.quantityAfter) };
}

export async function updateDoctorPart(input: {
  id: string;
  name?: string;
  code?: string;
  unit?: string;
  notes?: string;
  quantity?: number;
  delta?: number;
  minQuantity?: number | null;
  userId: string;
  reason?: string;
}): Promise<void> {
  if (input.quantity !== undefined && input.delta !== undefined) {
    throw new AppError("VALIDATION_ERROR", "יש לעדכן כמות באחת מהדרכים", 400);
  }
  if (input.delta !== undefined && (!Number.isInteger(input.delta) || input.delta === 0)) {
    throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  }
  if (input.quantity !== undefined && !Number.isInteger(input.quantity)) {
    throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  }
  await prisma.$transaction(async (tx) => {
    const part = await tx.doctorPart.findUnique({ where: { id: input.id } });
    if (!part || part.archivedAt) throw new AppError("NOT_FOUND", "החלק לא נמצא", 404);
    const data: { name?: string; code?: string; unit?: string; notes?: string } = {};
    if (input.name !== undefined) data.name = cleanName(input.name);
    if (input.code !== undefined) data.code = cleanText(input.code, 40, "קוד החלק");
    if (input.unit !== undefined) data.unit = cleanText(input.unit, 40, "יחידת המידה");
    if (input.notes !== undefined) data.notes = cleanText(input.notes, 500, "ההערה");
    if (Object.keys(data).length > 0) await tx.doctorPart.update({ where: { id: part.id }, data });

    const moved = input.delta !== undefined
      ? await adjustDoctorPartQuantity(tx, part.id, input.delta)
      : input.quantity !== undefined
        ? await setDoctorPartQuantity(tx, part.id, input.quantity)
        : null;
    if (!moved) return;
    await writeMovement(tx, {
      partId: part.id,
      operationId: `manual:${part.id}:${moved.quantityBefore}->${moved.quantityAfter}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      type: input.delta !== undefined ? (input.delta > 0 ? "STOCK_IN" : "STOCK_OUT") : "MANUAL_CORRECTION",
      quantityChange: moved.quantityAfter - moved.quantityBefore,
      quantityBefore: moved.quantityBefore,
      quantityAfter: moved.quantityAfter,
      userId: input.userId,
      reason: input.reason,
      source: "MANUAL",
    });
  });
  if (input.minQuantity !== undefined) await saveMinQuantity(input.id, cleanMin(input.minQuantity) ?? null, input.userId);
}

export async function countDoctorPart(input: { id: string; physicalQuantity: number; userId: string; reason?: string }): Promise<void> {
  if (!Number.isInteger(input.physicalQuantity)) throw new AppError("VALIDATION_ERROR", "כמות הספירה אינה תקינה", 400);
  await prisma.$transaction(async (tx) => {
    const part = await tx.doctorPart.findUnique({ where: { id: input.id } });
    if (!part || part.archivedAt) throw new AppError("NOT_FOUND", "החלק לא נמצא", 404);
    const moved = await setDoctorPartQuantity(tx, part.id, input.physicalQuantity);
    if (!moved) return;
    await writeMovement(tx, {
      partId: part.id,
      operationId: `count:${part.id}:${moved.quantityBefore}->${moved.quantityAfter}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      type: "MANUAL_CORRECTION",
      quantityChange: moved.quantityAfter - moved.quantityBefore,
      quantityBefore: moved.quantityBefore,
      quantityAfter: moved.quantityAfter,
      userId: input.userId,
      reason: input.reason ?? "ספירת מלאי",
      source: "MANUAL",
    });
  });
}

export async function deleteDoctorPart(id: string): Promise<{ archived: boolean }> {
  const part = await prisma.doctorPart.findUnique({
    where: { id },
    include: { _count: { select: { movements: true, orderParts: true } } },
  });
  if (!part || part.archivedAt) throw new AppError("NOT_FOUND", "החלק לא נמצא", 404);
  if (part._count.movements > 0 || part._count.orderParts > 0) {
    await prisma.doctorPart.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.doctorPart.delete({ where: { id } });
  return { archived: false };
}

function normalizeLines(lines: DoctorPartSelection[]): DoctorPartSelection[] {
  try {
    return mergeDoctorPartSelections(lines);
  } catch (error) {
    throw new AppError("VALIDATION_ERROR", error instanceof Error ? error.message : "כמות החלק אינה תקינה", 400);
  }
}

async function lockParts(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "DoctorPart" WHERE id IN (${Prisma.join(unique)}) ORDER BY id FOR UPDATE`;
}

async function claimOrderPart(
  tx: Tx,
  row: { id: string; appliedQty: number } | null,
  input: { orderId: string; partId: string; target: number; applied: number; nextApplied: number },
): Promise<boolean> {
  if (!row) {
    if (input.target === 0 && input.nextApplied === 0) return true;
    try {
      await tx.orderPart.create({
        data: {
          orderId: input.orderId,
          partId: input.partId,
          quantity: input.target,
          appliedQty: input.nextApplied,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueConflict(error)) return false;
      throw error;
    }
  }
  if (input.target === 0 && input.nextApplied === 0) {
    const removed = await tx.orderPart.deleteMany({ where: { id: row.id, appliedQty: input.applied } });
    return removed.count === 1;
  }
  const updated = await tx.orderPart.updateMany({
    where: { id: row.id, appliedQty: input.applied },
    data: { quantity: input.target, appliedQty: input.nextApplied },
  });
  return updated.count === 1;
}

export async function syncOrderDoctorParts(
  tx: Tx,
  input: { orderId: string; userId: string; lines: DoctorPartSelection[] },
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, serialNumber: true, status: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);
  const desired = normalizeLines(input.lines);
  const stockActive = order.status !== "CANCELLED" && order.status !== "DELETED" && order.status !== "DRAFT";
  const known = await tx.orderPart.findMany({ where: { orderId: order.id }, select: { partId: true } });
  const ids = [...new Set([...known.map((row) => row.partId), ...desired.map((row) => row.partId)])].sort();
  await lockParts(tx, ids);

  for (const partId of ids) {
    const target = desired.find((item) => item.partId === partId)?.quantity ?? 0;
    let saved = false;
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const row = await tx.orderPart.findUnique({ where: { orderId_partId: { orderId: order.id, partId } } });
      const applied = row?.appliedQty ?? 0;
      const nextApplied = stockActive ? target : applied;
      const consumeDelta = nextApplied - applied;
      if (target > 0) {
        const part = await tx.doctorPart.findUnique({ where: { id: partId } });
        if (!part || (part.archivedAt && !row)) throw new AppError("NOT_FOUND", "החלק לא נמצא", 404);
      }
      const claimed = await claimOrderPart(tx, row, { orderId: order.id, partId, target, applied, nextApplied });
      if (!claimed) continue;
      if (consumeDelta !== 0) {
        const moved = await adjustDoctorPartQuantity(tx, partId, -consumeDelta);
        if (!moved) throw new AppError("NOT_FOUND", "החלק לא נמצא", 404);
        await writeMovement(tx, {
          partId,
          orderId: order.id,
          orderSerial: order.serialNumber,
          operationId: movementKey(`order:${order.id}:${partId}:${applied}->${nextApplied}:${moved.quantityBefore}`),
          type: consumeDelta > 0 ? (applied === 0 ? "ORDER_CONSUMPTION" : "ORDER_ADJUSTMENT") : "ORDER_RETURN",
          quantityChange: moved.quantityAfter - moved.quantityBefore,
          quantityBefore: moved.quantityBefore,
          quantityAfter: moved.quantityAfter,
          userId: input.userId,
          reason: consumeDelta > 0
            ? (applied === 0 ? "הפחתה מהזמנה" : "התאמת כמות בהזמנה")
            : "החזרה מהזמנה",
          source: "ORDER",
        });
      }
      saved = true;
    }
    if (!saved) throw new AppError("CONFLICT", "החלק עודכן במקביל. נסו שוב.", 409);
  }
}

export async function releaseOrderDoctorParts(tx: Tx, input: { orderId: string; userId: string; reason: string }): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: input.orderId }, select: { serialNumber: true } });
  if (!order) return;
  const rows = await tx.orderPart.findMany({ where: { orderId: input.orderId, appliedQty: { gt: 0 } } });
  await lockParts(tx, rows.map((row) => row.partId));
  for (const row of rows) {
    const updated = await tx.orderPart.updateMany({ where: { id: row.id, appliedQty: row.appliedQty }, data: { appliedQty: 0 } });
    if (updated.count !== 1) continue;
    const moved = await adjustDoctorPartQuantity(tx, row.partId, row.appliedQty);
    if (!moved) throw new AppError("NOT_FOUND", "החלק לא נמצא", 404);
    await writeMovement(tx, {
      partId: row.partId,
      orderId: input.orderId,
      orderSerial: order.serialNumber,
      operationId: movementKey(`release:${input.orderId}:${row.partId}:${row.appliedQty}:${moved.quantityBefore}`),
      type: "ORDER_RETURN",
      quantityChange: moved.quantityAfter - moved.quantityBefore,
      quantityBefore: moved.quantityBefore,
      quantityAfter: moved.quantityAfter,
      userId: input.userId,
      reason: input.reason,
      source: "ORDER",
    });
  }
}

export async function reapplyOrderDoctorParts(tx: Tx, input: { orderId: string; userId: string; reason: string }): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: input.orderId }, select: { serialNumber: true, status: true } });
  if (!order || order.status === "CANCELLED" || order.status === "DELETED" || order.status === "DRAFT") return;
  const rows = await tx.orderPart.findMany({ where: { orderId: input.orderId } });
  await lockParts(tx, rows.map((row) => row.partId));
  for (const row of rows) {
    const delta = row.quantity - row.appliedQty;
    if (delta === 0) continue;
    const updated = await tx.orderPart.updateMany({
      where: { id: row.id, appliedQty: row.appliedQty },
      data: { appliedQty: row.quantity },
    });
    if (updated.count !== 1) continue;
    const moved = await adjustDoctorPartQuantity(tx, row.partId, -delta);
    if (!moved) throw new AppError("NOT_FOUND", "החלק לא נמצא", 404);
    await writeMovement(tx, {
      partId: row.partId,
      orderId: input.orderId,
      orderSerial: order.serialNumber,
      operationId: movementKey(`reapply:${input.orderId}:${row.partId}:${row.appliedQty}->${row.quantity}:${moved.quantityBefore}`),
      type: row.appliedQty === 0 ? "ORDER_CONSUMPTION" : "ORDER_ADJUSTMENT",
      quantityChange: moved.quantityAfter - moved.quantityBefore,
      quantityBefore: moved.quantityBefore,
      quantityAfter: moved.quantityAfter,
      userId: input.userId,
      reason: input.reason,
      source: "ORDER",
    });
  }
}
