import type { SimpleStockKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";

export type SimpleStockItemRow = {
  id: string;
  kind: SimpleStockKind;
  name: string;
  quantity: number;
  unit: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

const NAME_MAX = 120;
const UNIT_MAX = 40;
const NOTE_MAX = 500;

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
}): SimpleStockItemRow {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSimpleStock(kind: SimpleStockKind): Promise<SimpleStockItemRow[]> {
  const rows = await prisma.simpleStockItem.findMany({
    where: { kind, archivedAt: null },
    orderBy: { name: "asc" },
  });
  return rows.map(mapItem);
}

export async function createSimpleStockItem(input: {
  kind: SimpleStockKind;
  name: string;
  quantity?: number;
  unit?: string;
  note?: string;
  performedBy: string;
}): Promise<void> {
  const name = cleanName(input.name);
  const quantity = cleanQuantity(input.quantity ?? 0);
  const unit = cleanOptional(input.unit, UNIT_MAX, "יחידת המידה");
  const note = cleanOptional(input.note, NOTE_MAX, "ההערה");

  await prisma.$transaction(async (tx) => {
    const item = await tx.simpleStockItem.create({
      data: { kind: input.kind, name, quantity, unit, note },
    });
    await tx.simpleStockMovement.create({
      data: {
        itemId: item.id,
        action: "SET",
        quantity,
        delta: quantity,
        balanceAfter: quantity,
        performedBy: input.performedBy,
      },
    });
  });
}

export async function updateSimpleStockItem(input: {
  id: string;
  name?: string;
  quantity?: number;
  unit?: string;
  note?: string;
  delta?: number;
  performedBy: string;
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
