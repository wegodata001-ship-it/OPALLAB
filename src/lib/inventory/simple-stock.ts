import type { SimpleStockKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { setInventoryBarcode, uploadInventoryImage } from "@/lib/inventory/inventory-media";

export type SimpleStockItemRow = {
  id: string;
  kind: SimpleStockKind;
  name: string;
  quantity: number;
  unit: string;
  note: string;
  minQuantity: number | null;
  createdAt: string;
  updatedAt: string;
};

export type SimpleStockHistoryRow = {
  id: string;
  action: string;
  quantity: number;
  delta: number;
  balanceAfter: number;
  userName: string;
  createdAt: string;
};

const NAME_MAX = 120;
const UNIT_MAX = 40;
const NOTE_MAX = 500;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 6_000_000;

function cleanName(raw: string | undefined): string {
  const name = raw?.trim() ?? "";
  if (!name) throw new AppError("VALIDATION_ERROR", "חסר שם מוצר", 400);
  if (name.length > NAME_MAX) throw new AppError("VALIDATION_ERROR", "שם המוצר ארוך מדי", 400);
  return name;
}

function cleanOptional(raw: string | undefined, max: number, label: string): string {
  const value = raw?.trim() ?? "";
  if (value.length > max) throw new AppError("VALIDATION_ERROR", `${label} ארוך מדי`, 400);
  return value;
}

function cleanQuantity(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  }
  return value;
}

function mapItem(row: {
  id: string;
  kind: SimpleStockKind;
  name: string;
  quantity: number;
  unit: string;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}, minQuantity: number | null): SimpleStockItemRow {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    note: row.note,
    minQuantity,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSimpleStock(kind: SimpleStockKind): Promise<SimpleStockItemRow[]> {
  const rows = await prisma.simpleStockItem.findMany({
    where: { kind, archivedAt: null },
    orderBy: { name: "asc" },
  });
  const thresholds = rows.length === 0 ? [] : await prisma.inventoryStockThreshold.findMany({
    where: { inventoryType: kind, itemId: { in: rows.map((row) => row.id) } },
    select: { itemId: true, minQuantity: true },
  });
  const mins = new Map(thresholds.map((row) => [row.itemId, row.minQuantity]));
  return rows.map((row) => mapItem(row, mins.get(row.id) ?? null));
}

export async function listSimpleStockHistory(id: string): Promise<SimpleStockHistoryRow[]> {
  const rows = await prisma.simpleStockMovement.findMany({
    where: { itemId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { performer: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    quantity: row.quantity,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    userName: row.performer.name,
    createdAt: row.createdAt.toISOString(),
  }));
}

function cleanMin(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new AppError("VALIDATION_ERROR", "כמות המינימום אינה תקינה", 400);
  return value;
}

async function saveMinQuantity(kind: SimpleStockKind, itemId: string, minQuantity: number | null, userId: string) {
  if (minQuantity === null) {
    await prisma.inventoryStockThreshold.deleteMany({ where: { inventoryType: kind, itemId } });
    return;
  }
  await prisma.inventoryStockThreshold.upsert({
    where: { inventoryType_itemId: { inventoryType: kind, itemId } },
    create: { inventoryType: kind, itemId, minQuantity, alertsEnabled: minQuantity > 0, updatedById: userId },
    update: { minQuantity, alertsEnabled: minQuantity > 0, updatedById: userId },
  });
}

export async function createSimpleStockItem(input: {
  kind: SimpleStockKind;
  name: string;
  quantity?: number;
  unit?: string;
  note?: string;
  performedBy: string;
}): Promise<string> {
  const name = cleanName(input.name);
  const quantity = cleanQuantity(input.quantity ?? 0);
  const unit = cleanOptional(input.unit, UNIT_MAX, "יחידת המידה");
  const note = cleanOptional(input.note, NOTE_MAX, "ההערה");

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.simpleStockItem.create({
      data: { kind: input.kind, name, quantity, unit, note },
    });
    await tx.simpleStockMovement.create({
      data: {
        itemId: created.id,
        action: "SET",
        quantity,
        delta: quantity,
        balanceAfter: quantity,
        performedBy: input.performedBy,
      },
    });
    return created;
  });
  return item.id;
}

export async function discardNewSimpleStockItem(id: string): Promise<void> {
  const { deleteFile } = await import("@/lib/supabase/storage");
  const { STORAGE_BUCKETS } = await import("@/lib/supabase/admin");
  const images = await prisma.inventoryImage.findMany({
    where: { entityId: id, module: { in: ["CLINIC_MATERIALS", "OTHER_MATERIALS"] }, entityKind: "item" },
  });
  for (const image of images) {
    await deleteFile(STORAGE_BUCKETS.INVENTORY_IMAGES, image.storagePath).catch(() => undefined);
    await prisma.inventoryImage.delete({ where: { id: image.id } });
  }
  await prisma.inventoryScanCode.deleteMany({ where: { entityId: id, module: { in: ["CLINIC_MATERIALS", "OTHER_MATERIALS"] }, entityKind: "item" } });
  await prisma.inventoryStockThreshold.deleteMany({ where: { itemId: id, inventoryType: { in: ["CLINIC_MATERIALS", "OTHER_MATERIALS"] } } });
  await prisma.simpleStockMovement.deleteMany({ where: { itemId: id } });
  await prisma.simpleStockItem.delete({ where: { id } });
}

export async function createSimpleStockProduct(input: {
  kind: SimpleStockKind;
  name: string;
  quantity?: number;
  unit?: string;
  note?: string;
  minQuantity?: number | null;
  barcode?: string;
  image?: { bytes: Buffer; mimeType: string } | null;
  performedBy: string;
}): Promise<string> {
  const barcode = input.barcode?.trim() ?? "";
  if (barcode) {
    const [scan, classic] = await Promise.all([
      prisma.inventoryScanCode.findUnique({ where: { code: barcode }, select: { id: true } }),
      prisma.inventoryItem.findFirst({ where: { barcode }, select: { id: true } }),
    ]);
    if (scan || classic) throw new AppError("CONFLICT", "הברקוד כבר משויך למוצר אחר", 409);
  }
  if (input.image) {
    if (!IMAGE_TYPES.has(input.image.mimeType)) throw new AppError("VALIDATION_ERROR", "אפשר להעלות JPG, PNG או WEBP", 400);
    if (input.image.bytes.byteLength === 0 || input.image.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new AppError("VALIDATION_ERROR", "גודל התמונה גדול מדי", 400);
    }
  }
  const minQuantity = cleanMin(input.minQuantity);
  const id = await createSimpleStockItem(input);
  try {
    if (input.image) {
      await uploadInventoryImage({
        module: input.kind,
        entityKind: "item",
        entityId: id,
        userId: input.performedBy,
        bytes: input.image.bytes,
        mimeType: input.image.mimeType,
        makePrimary: true,
      });
    }
    if (barcode) {
      await setInventoryBarcode({ module: input.kind, entityKind: "item", entityId: id, code: barcode, userId: input.performedBy });
    }
    if (minQuantity !== undefined) await saveMinQuantity(input.kind, id, minQuantity, input.performedBy);
  } catch (error) {
    await discardNewSimpleStockItem(id).catch(() => undefined);
    throw error;
  }
  return id;
}

async function itemKind(id: string): Promise<SimpleStockKind> {
  const item = await prisma.simpleStockItem.findUnique({ where: { id }, select: { kind: true } });
  if (!item) throw new AppError("NOT_FOUND", "המוצר לא נמצא", 404);
  return item.kind;
}

export async function updateSimpleStockItem(input: {
  id: string;
  name?: string;
  quantity?: number;
  unit?: string;
  note?: string;
  delta?: number;
  performedBy: string;
  minQuantity?: number | null;
}): Promise<void> {
  if (input.quantity !== undefined && input.delta !== undefined) {
    throw new AppError("VALIDATION_ERROR", "יש לעדכן כמות באחת מהדרכים", 400);
  }

  await prisma.$transaction(async (tx) => {
    const item = await tx.simpleStockItem.findUnique({ where: { id: input.id } });
    if (!item || item.archivedAt) throw new AppError("NOT_FOUND", "המוצר לא נמצא", 404);

    const data: { name?: string; unit?: string; note?: string; quantity?: number } = {};
    if (input.name !== undefined) data.name = cleanName(input.name);
    if (input.unit !== undefined) data.unit = cleanOptional(input.unit, UNIT_MAX, "יחידת המידה");
    if (input.note !== undefined) data.note = cleanOptional(input.note, NOTE_MAX, "ההערה");

    let next = item.quantity;
    let action: "IN" | "OUT" | "SET" | null = null;
    let amount = 0;
    let delta = 0;

    if (input.delta !== undefined) {
      if (!Number.isInteger(input.delta) || input.delta === 0) {
        throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
      }
      next = item.quantity + input.delta;
      if (next < 0) throw new AppError("VALIDATION_ERROR", "אין מספיק מלאי להפחתה", 400);
      action = input.delta > 0 ? "IN" : "OUT";
      amount = Math.abs(input.delta);
      delta = input.delta;
    } else if (input.quantity !== undefined) {
      next = cleanQuantity(input.quantity);
      if (next !== item.quantity) {
        action = "SET";
        amount = next;
        delta = next - item.quantity;
      }
    }

    if (action) data.quantity = next;
    if (Object.keys(data).length === 0) return;

    await tx.simpleStockItem.update({ where: { id: item.id }, data });
    if (action) {
      await tx.simpleStockMovement.create({
        data: {
          itemId: item.id,
          action,
          quantity: amount,
          delta,
          balanceAfter: next,
          performedBy: input.performedBy,
        },
      });
    }
  });
  if (input.minQuantity !== undefined) {
    await saveMinQuantity(await itemKind(input.id), input.id, cleanMin(input.minQuantity) ?? null, input.performedBy);
  }
}

export async function deleteSimpleStockItem(id: string): Promise<{ archived: boolean }> {
  const item = await prisma.simpleStockItem.findUnique({
    where: { id },
    include: { _count: { select: { movements: true } } },
  });
  if (!item || item.archivedAt) throw new AppError("NOT_FOUND", "המוצר לא נמצא", 404);
  if (item._count.movements > 0) {
    await prisma.simpleStockItem.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.simpleStockItem.delete({ where: { id } });
  return { archived: false };
}
