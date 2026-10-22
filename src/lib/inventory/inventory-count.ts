import { Prisma, type InventoryCountStatus, type InventoryModuleType, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { isSystemAdminUser, canDeleteOrders } from "@/lib/user-roles";
import type { User } from "@prisma/client";
import { adjustBmmaStock } from "@/lib/inventory/bmma-catalog";
import { updateDoctorPart } from "@/lib/inventory/doctor-parts";
import { adjustImplantStock } from "@/lib/inventory/implant-catalog";
import { updateSimpleStockItem } from "@/lib/inventory/simple-stock";
import { adjustZirconiaHeight } from "@/lib/inventory/zirconia-stock";
import { listCountableItems, type CountableItem } from "@/lib/inventory/inventory-count-items";

export type { CountableItem };
export { listCountableItems };

const MODULE_TYPES: InventoryModuleType[] = [
  "ZIRCONIA",
  "TITANIUM",
  "BMMA",
  "DRILLS",
  "IMPLANTS",
  "CLINIC_MATERIALS",
  "OTHER_MATERIALS",
  "DOCTOR_PARTS",
];

const QTY_TABLE: Record<InventoryModuleType, string> = {
  ZIRCONIA: "ZirconiaHeight",
  TITANIUM: "TitaniumSize",
  BMMA: "BmmaHeight",
  DRILLS: "DrillBit",
  IMPLANTS: "ImplantHeight",
  CLINIC_MATERIALS: "SimpleStockItem",
  OTHER_MATERIALS: "SimpleStockItem",
  DOCTOR_PARTS: "DoctorPart",
};

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use">;

export function parseInventoryModuleType(value: string | null | undefined): InventoryModuleType {
  if (value && MODULE_TYPES.includes(value as InventoryModuleType)) return value as InventoryModuleType;
  throw new AppError("VALIDATION_ERROR", "סוג מלאי לא תקין", 400);
}

export function canEditInventoryCount(user: Pick<User, "role" | "roles">, type: InventoryModuleType) {
  if (type === "ZIRCONIA" || type === "TITANIUM") return canDeleteOrders(user);
  return isSystemAdminUser(user);
}

function cleanText(value: string | undefined, max: number) {
  const text = value?.trim() ?? "";
  if (text.length > max) throw new AppError("VALIDATION_ERROR", "הטקסט ארוך מדי", 400);
  return text;
}

function allowsNegative(type: InventoryModuleType) {
  return type === "DOCTOR_PARTS";
}

function sameQty(left: number | null, right: number | null) {
  return left === right;
}

function assertCounted(type: InventoryModuleType, quantity: number) {
  if (!Number.isInteger(quantity)) throw new AppError("VALIDATION_ERROR", "כמות הספירה אינה תקינה", 400);
  if (quantity < 0 && !allowsNegative(type)) throw new AppError("VALIDATION_ERROR", "הכמות אינה יכולה להיות שלילית", 400);
}

function tableSql(type: InventoryModuleType) {
  return Prisma.raw(`"${QTY_TABLE[type]}"`);
}

async function lockQuantity(tx: Tx, type: InventoryModuleType, itemId: string): Promise<number | null | undefined> {
  const rows = await tx.$queryRaw<Array<{ quantity: number | null }>>(
    Prisma.sql`SELECT quantity FROM ${tableSql(type)} WHERE id = ${itemId} AND "archivedAt" IS NULL FOR UPDATE`,
  );
  if (rows.length === 0) return undefined;
  const quantity = rows[0]?.quantity;
  return quantity === null || quantity === undefined ? null : Number(quantity);
}

async function writeCountMovement(
  tx: Tx,
  input: { type: InventoryModuleType; itemId: string; before: number | null; after: number; userId: string; countId: string; serial: number },
) {
  const before = input.before ?? 0;
  const change = input.after - before;
  const reason = `ספירת מלאי #${input.serial}`;
  if (input.type === "ZIRCONIA") {
    await tx.zirconiaStockMovement.create({
      data: { heightId: input.itemId, action: "COUNT", quantityBefore: before, quantityChange: change, quantityAfter: input.after, reason, countId: input.countId, performedBy: input.userId },
    });
  } else if (input.type === "TITANIUM") {
    await tx.titaniumStockMovement.create({
      data: { sizeId: input.itemId, action: "COUNT", quantityBefore: before, quantityChange: change, quantityAfter: input.after, reason, countId: input.countId, performedBy: input.userId },
    });
  } else if (input.type === "BMMA") {
    await tx.bmmaMovement.create({
      data: { heightId: input.itemId, action: "COUNT", quantity: input.after, delta: change, balanceAfter: input.after, reason, countId: input.countId, performedBy: input.userId },
    });
  } else if (input.type === "DRILLS") {
    await tx.drillStockMovement.create({
      data: { bitId: input.itemId, action: "COUNT", quantityBefore: before, quantityChange: change, quantityAfter: input.after, reason, countId: input.countId, performedBy: input.userId },
    });
  } else if (input.type === "IMPLANTS") {
    await tx.implantStockMovement.create({
      data: { heightId: input.itemId, action: "COUNT", quantityBefore: before, quantity: input.after, delta: change, balanceAfter: input.after, reason, countId: input.countId, performedBy: input.userId },
    });
  } else if (input.type === "CLINIC_MATERIALS" || input.type === "OTHER_MATERIALS") {
    await tx.simpleStockMovement.create({
      data: { itemId: input.itemId, action: "COUNT", quantity: input.after, delta: change, balanceAfter: input.after, countId: input.countId, performedBy: input.userId },
    });
  } else {
    await tx.doctorPartMovement.create({
      data: {
        partId: input.itemId,
        operationId: `count:${input.countId}:${input.itemId}`,
        type: "STOCK_COUNT",
        quantityChange: change,
        quantityBefore: before,
        quantityAfter: input.after,
        userId: input.userId,
        reason,
        source: "COUNT",
        countId: input.countId,
      },
    });
  }
}

async function writeAdjustMovement(tx: Tx, input: { type: "TITANIUM" | "DRILLS"; itemId: string; before: number | null; after: number; userId: string; delta: number }) {
  const before = input.before ?? 0;
  const reason = input.delta > 0 ? "הוספת מלאי" : "הפחתת מלאי";
  const action = input.delta > 0 ? "IN" : "OUT";
  if (input.type === "TITANIUM") {
    await tx.titaniumStockMovement.create({
      data: { sizeId: input.itemId, action, quantityBefore: before, quantityChange: input.after - before, quantityAfter: input.after, reason, performedBy: input.userId },
    });
  } else {
    await tx.drillStockMovement.create({
      data: { bitId: input.itemId, action, quantityBefore: before, quantityChange: input.after - before, quantityAfter: input.after, reason, performedBy: input.userId },
    });
  }
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const countInclude = {
  createdBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  lines: { orderBy: [{ modelName: "asc" as const }, { kindName: "asc" as const }, { colorName: "asc" as const }, { sizeName: "asc" as const }, { name: "asc" as const }] },
};

export async function listInventoryCounts(type: InventoryModuleType) {
  const [items, counts] = await Promise.all([
    listCountableItems(type),
    prisma.inventoryCount.findMany({
      where: { inventoryType: type },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { name: true } }, approvedBy: { select: { name: true } }, _count: { select: { lines: true } } },
    }),
  ]);
  return {
    items,
    counts: counts.map((count) => ({
      id: count.id,
      serial: count.serial,
      status: count.status,
      notes: count.notes,
      counterName: count.counterName,
      location: count.location,
      countedItems: count.countedItems,
      changedItems: count.changedItems,
      unchangedItems: count.unchangedItems,
      differenceTotal: count.differenceTotal,
      lineCount: count._count.lines,
      createdByName: count.createdBy.name,
      approvedByName: count.approvedBy?.name ?? "",
      createdAt: count.createdAt.toISOString(),
      approvedAt: count.approvedAt?.toISOString() ?? null,
      cancelledAt: count.cancelledAt?.toISOString() ?? null,
    })),
  };
}

export async function getInventoryCount(id: string) {
  const count = await prisma.inventoryCount.findUnique({ where: { id }, include: countInclude });
  if (!count) throw new AppError("NOT_FOUND", "הספירה לא נמצאה", 404);
  const live = count.status === "DRAFT" ? await listCountableItems(count.inventoryType) : [];
  const liveQty = new Map(live.map((item) => [item.id, item.quantity]));
  return {
    ...serializeCount(count),
    lines: count.lines.map((line) => ({
      ...serializeLine(line),
      liveQuantity: count.status === "DRAFT" ? (liveQty.has(line.itemId) ? liveQty.get(line.itemId) ?? null : null) : line.quantityAfter,
    })),
  };
}

function serializeCount(count: {
  id: string;
  inventoryType: InventoryModuleType;
  serial: number;
  status: InventoryCountStatus;
  notes: string;
  counterName: string;
  location: string;
  countedItems: number;
  changedItems: number;
  unchangedItems: number;
  differenceTotal: number;
  createdAt: Date;
  approvedAt: Date | null;
  cancelledAt: Date | null;
  createdBy: { name: string };
  approvedBy: { name: string } | null;
}) {
  return {
    id: count.id,
    inventoryType: count.inventoryType,
    serial: count.serial,
    status: count.status,
    notes: count.notes,
    counterName: count.counterName,
    location: count.location,
    countedItems: count.countedItems,
    changedItems: count.changedItems,
    unchangedItems: count.unchangedItems,
    differenceTotal: count.differenceTotal,
    createdByName: count.createdBy.name,
    approvedByName: count.approvedBy?.name ?? "",
    createdAt: count.createdAt.toISOString(),
    approvedAt: count.approvedAt?.toISOString() ?? null,
    cancelledAt: count.cancelledAt?.toISOString() ?? null,
  };
}

function serializeLine(line: {
  id: string;
  itemId: string;
  name: string;
  modelName: string;
  kindName: string;
  colorName: string;
  sizeName: string;
  barcode: string;
  quantityAtStart: number | null;
  countedQuantity: number | null;
  quantityBeforeApproval: number | null;
  difference: number | null;
  quantityAfter: number | null;
  notes: string;
}) {
  return line;
}

export async function createInventoryCount(input: {
  type: InventoryModuleType;
  itemIds?: string[];
  notes?: string;
  counterName?: string;
  location?: string;
  userId: string;
}) {
  const items = await listCountableItems(input.type);
  const selected = input.itemIds && input.itemIds.length > 0 ? items.filter((item) => input.itemIds?.includes(item.id)) : items;
  if (input.itemIds && input.itemIds.length > 0 && selected.length !== new Set(input.itemIds).size) {
    throw new AppError("VALIDATION_ERROR", "אחד הפריטים שנבחרו אינו קיים במלאי", 400);
  }
  if (selected.length === 0) throw new AppError("VALIDATION_ERROR", "אין פריטים לספירה", 400);
  const notes = cleanText(input.notes, 500);
  const counterName = cleanText(input.counterName, 80);
  const location = cleanText(input.location, 120);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const max = await tx.inventoryCount.aggregate({ where: { inventoryType: input.type }, _max: { serial: true } });
        const created = await tx.inventoryCount.create({
          data: {
            inventoryType: input.type,
            serial: (max._max.serial ?? 0) + 1,
            notes,
            counterName,
            location,
            createdById: input.userId,
            lines: {
              create: selected.map((item) => ({
                itemId: item.id,
                name: item.name,
                modelName: item.modelName,
                kindName: item.kindName,
                colorName: item.colorName,
                sizeName: item.sizeName,
                barcode: item.barcode,
                quantityAtStart: item.quantity,
              })),
            },
          },
          include: countInclude,
        });
        return { ...serializeCount(created), lines: created.lines.map((line) => ({ ...serializeLine(line), liveQuantity: line.quantityAtStart })) };
      });
    } catch (error) {
      if (!isUnique(error) || attempt === 4) throw error;
    }
  }
  throw new AppError("CONFLICT", "לא ניתן לפתוח ספירה כרגע. נסו שוב.", 409);
}

export async function saveInventoryCount(input: {
  countId: string;
  notes?: string;
  counterName?: string;
  location?: string;
  lines: { itemId: string; countedQuantity: number | null; notes?: string }[];
}) {
  const count = await prisma.inventoryCount.findUnique({ where: { id: input.countId }, include: { lines: true } });
  if (!count) throw new AppError("NOT_FOUND", "הספירה לא נמצאה", 404);
  if (count.status !== "DRAFT") throw new AppError("CONFLICT", "אפשר לשמור רק ספירה בטיוטה", 409);
  const known = new Map(count.lines.map((line) => [line.itemId, line]));
  for (const line of input.lines) {
    if (!known.has(line.itemId)) throw new AppError("VALIDATION_ERROR", "פריט אינו שייך לספירה", 400);
    if (line.countedQuantity !== null) assertCounted(count.inventoryType, line.countedQuantity);
    cleanText(line.notes, 300);
  }
  await prisma.$transaction(async (tx) => {
    if (input.notes !== undefined || input.counterName !== undefined || input.location !== undefined) {
      await tx.inventoryCount.update({
        where: { id: count.id },
        data: {
          ...(input.notes !== undefined ? { notes: cleanText(input.notes, 500) } : {}),
          ...(input.counterName !== undefined ? { counterName: cleanText(input.counterName, 80) } : {}),
          ...(input.location !== undefined ? { location: cleanText(input.location, 120) } : {}),
        },
      });
    }
    for (const line of input.lines) {
      await tx.inventoryCountLine.update({
        where: { countId_itemId: { countId: count.id, itemId: line.itemId } },
        data: { countedQuantity: line.countedQuantity, ...(line.notes !== undefined ? { notes: cleanText(line.notes, 300) } : {}) },
      });
    }
  });
  return getInventoryCount(count.id);
}

export async function refreshInventoryCount(countId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InventoryCount" WHERE id = ${countId} FOR UPDATE`;
    const count = await tx.inventoryCount.findUnique({ where: { id: countId }, include: { lines: true } });
    if (!count) throw new AppError("NOT_FOUND", "הספירה לא נמצאה", 404);
    if (count.status !== "DRAFT") throw new AppError("CONFLICT", "אפשר לרענן רק ספירה בטיוטה", 409);
    for (const line of count.lines) {
      const current = await lockQuantity(tx, count.inventoryType, line.itemId);
      if (current === undefined) continue;
      await tx.inventoryCountLine.update({ where: { id: line.id }, data: { quantityAtStart: current } });
    }
  });
  return getInventoryCount(countId);
}

export async function cancelInventoryCount(countId: string) {
  const updated = await prisma.inventoryCount.updateMany({
    where: { id: countId, status: "DRAFT" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (updated.count !== 1) {
    const existing = await prisma.inventoryCount.findUnique({ where: { id: countId } });
    if (!existing) throw new AppError("NOT_FOUND", "הספירה לא נמצאה", 404);
    throw new AppError("CONFLICT", "הספירה כבר נסגרה", 409);
  }
  return getInventoryCount(countId);
}

export async function approveInventoryCount(input: { countId: string; userId: string }) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InventoryCount" WHERE id = ${input.countId} FOR UPDATE`;
    const count = await tx.inventoryCount.findUnique({ where: { id: input.countId }, include: { lines: true } });
    if (!count) throw new AppError("NOT_FOUND", "הספירה לא נמצאה", 404);
    if (count.status === "APPROVED") throw new AppError("CONFLICT", "הספירה כבר אושרה", 409);
    if (count.status !== "DRAFT") throw new AppError("CONFLICT", "הספירה אינה בטיוטה", 409);
    const filled = count.lines.filter((line) => line.countedQuantity !== null);
    if (filled.length === 0) throw new AppError("VALIDATION_ERROR", "לא הוזנה כמות ספירה. שדה ריק אינו משנה מלאי.", 400);

    const conflicts: { itemId: string; name: string; quantityAtStart: number | null; currentQuantity: number | null }[] = [];
    const ready: { line: (typeof filled)[number]; current: number | null }[] = [];
    for (const line of filled) {
      assertCounted(count.inventoryType, line.countedQuantity as number);
      const current = await lockQuantity(tx, count.inventoryType, line.itemId);
      if (current === undefined || !sameQty(current, line.quantityAtStart)) {
        conflicts.push({ itemId: line.itemId, name: line.name, quantityAtStart: line.quantityAtStart, currentQuantity: current ?? null });
      } else {
        ready.push({ line, current });
      }
    }
    if (conflicts.length > 0) {
      throw new AppError("CONFLICT", "המלאי השתנה מאז תחילת הספירה. יש לרענן את כמויות הפתיחה ולאשר מחדש.", 409, { conflicts });
    }

    let changedItems = 0;
    let unchangedItems = 0;
    let differenceTotal = 0;
    for (const entry of ready) {
      const next = entry.line.countedQuantity as number;
      const difference = next - (entry.current ?? 0);
      if (sameQty(entry.current, next)) {
        unchangedItems += 1;
        await tx.inventoryCountLine.update({
          where: { id: entry.line.id },
          data: { quantityBeforeApproval: entry.current, quantityAfter: next, difference: 0 },
        });
        continue;
      }
      const updated = await tx.$executeRaw(
        Prisma.sql`UPDATE ${tableSql(count.inventoryType)} SET quantity = ${next}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${entry.line.itemId} AND quantity IS NOT DISTINCT FROM ${entry.current}`,
      );
      if (Number(updated) !== 1) throw new AppError("CONFLICT", "המלאי השתנה במהלך האישור. נסו שוב.", 409);
      await writeCountMovement(tx, {
        type: count.inventoryType,
        itemId: entry.line.itemId,
        before: entry.current,
        after: next,
        userId: input.userId,
        countId: count.id,
        serial: count.serial,
      });
      changedItems += 1;
      differenceTotal += difference;
      await tx.inventoryCountLine.update({
        where: { id: entry.line.id },
        data: { quantityBeforeApproval: entry.current, quantityAfter: next, difference },
      });
    }

    await tx.inventoryCount.update({
      where: { id: count.id },
      data: {
        status: "APPROVED",
        approvedById: input.userId,
        approvedAt: new Date(),
        countedItems: ready.length,
        changedItems,
        unchangedItems,
        differenceTotal,
      },
    });
  });
  return getInventoryCount(input.countId);
}

export async function adjustCountableItem(input: { type: InventoryModuleType; itemId: string; delta: number; userId: string }) {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  const reason = input.delta > 0 ? "הוספת מלאי" : "הפחתת מלאי";
  if (input.type === "ZIRCONIA") {
    await adjustZirconiaHeight({ id: input.itemId, delta: input.delta, userId: input.userId, reason });
    return;
  }
  if (input.type === "BMMA") {
    await adjustBmmaStock({ heightId: input.itemId, action: input.delta > 0 ? "IN" : "OUT", quantity: Math.abs(input.delta), reason, performedBy: input.userId });
    return;
  }
  if (input.type === "IMPLANTS") {
    await adjustImplantStock({ heightId: input.itemId, action: input.delta > 0 ? "IN" : "OUT", quantity: Math.abs(input.delta), reason, performedBy: input.userId });
    return;
  }
  if (input.type === "CLINIC_MATERIALS" || input.type === "OTHER_MATERIALS") {
    await updateSimpleStockItem({ id: input.itemId, delta: input.delta, performedBy: input.userId });
    return;
  }
  if (input.type === "DOCTOR_PARTS") {
    await updateDoctorPart({ id: input.itemId, delta: input.delta, userId: input.userId, reason });
    return;
  }
  if (input.type !== "TITANIUM" && input.type !== "DRILLS") {
    throw new AppError("VALIDATION_ERROR", "סוג מלאי לא תקין", 400);
  }
  const stockType = input.type;
  await prisma.$transaction(async (tx) => {
    const current = await lockQuantity(tx, stockType, input.itemId);
    if (current === undefined) throw new AppError("NOT_FOUND", "הפריט לא נמצא", 404);
    const next = (current ?? 0) + input.delta;
    if (next < 0) throw new AppError("VALIDATION_ERROR", "אין מספיק מלאי להפחתה", 400);
    const updated = await tx.$executeRaw(
      Prisma.sql`UPDATE ${tableSql(stockType)} SET quantity = ${next}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${input.itemId} AND quantity IS NOT DISTINCT FROM ${current}`,
    );
    if (Number(updated) !== 1) throw new AppError("CONFLICT", "הכמות עודכנה במקביל. נסו שוב.", 409);
    await writeAdjustMovement(tx, { type: stockType, itemId: input.itemId, before: current, after: next, userId: input.userId, delta: input.delta });
  });
}

export type ItemMovementRow = {
  id: string;
  action: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  reason: string;
  userName: string;
  orderSerial: string;
  countSerial: number | null;
  createdAt: string;
};

export async function listItemMovements(type: InventoryModuleType, itemId: string): Promise<ItemMovementRow[]> {
  const rows = await readMovements(type, itemId);
  const countIds = [...new Set(rows.map((row) => row.countId).filter((id): id is string => Boolean(id)))];
  const counts = countIds.length === 0 ? [] : await prisma.inventoryCount.findMany({ where: { id: { in: countIds } }, select: { id: true, serial: true } });
  const serials = new Map(counts.map((count) => [count.id, count.serial]));
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    quantityBefore: row.quantityBefore,
    quantityChange: row.quantityChange,
    quantityAfter: row.quantityAfter,
    reason: row.reason,
    userName: row.userName,
    orderSerial: row.orderSerial,
    countSerial: row.countId ? serials.get(row.countId) ?? null : null,
    createdAt: row.createdAt,
  }));
}

async function readMovements(type: InventoryModuleType, itemId: string) {
  if (type === "ZIRCONIA") {
    const rows = await prisma.zirconiaStockMovement.findMany({ where: { heightId: itemId }, orderBy: { createdAt: "desc" }, take: 200, include: { performer: { select: { name: true } } } });
    return rows.map((row) => ({ id: row.id, action: row.action, quantityBefore: row.quantityBefore, quantityChange: row.quantityChange, quantityAfter: row.quantityAfter, reason: row.reason, userName: row.performer.name, orderSerial: "", countId: row.countId, createdAt: row.createdAt.toISOString() }));
  }
  if (type === "TITANIUM") {
    const rows = await prisma.titaniumStockMovement.findMany({ where: { sizeId: itemId }, orderBy: { createdAt: "desc" }, take: 200, include: { performer: { select: { name: true } } } });
    return rows.map((row) => ({ id: row.id, action: row.action, quantityBefore: row.quantityBefore, quantityChange: row.quantityChange, quantityAfter: row.quantityAfter, reason: row.reason, userName: row.performer.name, orderSerial: "", countId: row.countId, createdAt: row.createdAt.toISOString() }));
  }
  if (type === "BMMA") {
    const rows = await prisma.bmmaMovement.findMany({ where: { heightId: itemId }, orderBy: { createdAt: "desc" }, take: 200, include: { performer: { select: { name: true } } } });
    return rows.map((row) => ({ id: row.id, action: row.action, quantityBefore: row.balanceAfter - row.delta, quantityChange: row.delta, quantityAfter: row.balanceAfter, reason: row.reason, userName: row.performer.name, orderSerial: "", countId: row.countId, createdAt: row.createdAt.toISOString() }));
  }
  if (type === "DRILLS") {
    const rows = await prisma.drillStockMovement.findMany({ where: { bitId: itemId }, orderBy: { createdAt: "desc" }, take: 200, include: { performer: { select: { name: true } } } });
    return rows.map((row) => ({ id: row.id, action: row.action, quantityBefore: row.quantityBefore, quantityChange: row.quantityChange, quantityAfter: row.quantityAfter, reason: row.reason, userName: row.performer.name, orderSerial: "", countId: row.countId, createdAt: row.createdAt.toISOString() }));
  }
  if (type === "IMPLANTS") {
    const rows = await prisma.implantStockMovement.findMany({ where: { heightId: itemId }, orderBy: { createdAt: "desc" }, take: 200, include: { performer: { select: { name: true } } } });
    return rows.map((row) => ({ id: row.id, action: row.action, quantityBefore: row.quantityBefore, quantityChange: row.delta, quantityAfter: row.balanceAfter, reason: row.reason, userName: row.performer.name, orderSerial: "", countId: row.countId, createdAt: row.createdAt.toISOString() }));
  }
  if (type === "CLINIC_MATERIALS" || type === "OTHER_MATERIALS") {
    const rows = await prisma.simpleStockMovement.findMany({ where: { itemId }, orderBy: { createdAt: "desc" }, take: 200, include: { performer: { select: { name: true } } } });
    return rows.map((row) => ({ id: row.id, action: row.action, quantityBefore: row.balanceAfter - row.delta, quantityChange: row.delta, quantityAfter: row.balanceAfter, reason: "", userName: row.performer.name, orderSerial: "", countId: row.countId, createdAt: row.createdAt.toISOString() }));
  }
  const rows = await prisma.doctorPartMovement.findMany({ where: { partId: itemId }, orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { name: true } } } });
  return rows.map((row) => ({ id: row.id, action: row.type, quantityBefore: row.quantityBefore, quantityChange: row.quantityChange, quantityAfter: row.quantityAfter, reason: row.reason, userName: row.user.name, orderSerial: row.orderSerial, countId: row.countId, createdAt: row.createdAt.toISOString() }));
}
