import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { setInventoryBarcode } from "@/lib/inventory/inventory-media";
import { DRILL_MODELS, DRILL_TYPES } from "@/lib/inventory/inventory-media-shared";

export { DRILL_CATALOG_ID, DRILL_MODELS, DRILL_TYPES } from "@/lib/inventory/inventory-media-shared";

function cleanName(value: string | undefined, label: string) {
  const name = value?.trim() ?? "";
  if (!name) throw new AppError("VALIDATION_ERROR", `חסר ${label}`, 400);
  if (name.length > 80) throw new AppError("VALIDATION_ERROR", `${label} ארוך מדי`, 400);
  return name;
}

function cleanNote(value: string | undefined) {
  const note = value?.trim() ?? "";
  if (note.length > 400) throw new AppError("VALIDATION_ERROR", "ההערה ארוכה מדי", 400);
  return note;
}

function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase("en") === right.trim().toLocaleLowerCase("en");
}

export async function ensureDrillCatalog() {
  const machines = await prisma.drillMachine.findMany({
    include: { types: { include: { bits: { where: { archivedAt: null }, select: { id: true } } } } },
  });
  for (const [index, name] of DRILL_MODELS.entries()) {
    let machine = machines.find((item) => sameName(item.name, name));
    if (!machine) {
      const created = await prisma.drillMachine.create({
        data: { name, description: "", sortOrder: index },
        include: { types: { include: { bits: { where: { archivedAt: null }, select: { id: true } } } } },
      });
      machines.push(created);
      machine = created;
    }
    if (machine.archivedAt) continue;
    for (const [typeIndex, typeName] of DRILL_TYPES.entries()) {
      let type = machine.types.find((item) => sameName(item.name, typeName));
      if (!type) {
        const created = await prisma.drillType.create({
          data: { machineId: machine.id, name: typeName, note: "", sortOrder: typeIndex },
          include: { bits: { where: { archivedAt: null }, select: { id: true } } },
        });
        machine.types.push(created);
        type = created;
      }
      if (type.archivedAt) continue;
    }
  }
}

export async function listDrills() {
  await ensureDrillCatalog();
  const machines = await prisma.drillMachine.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      types: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          bits: {
            where: { archivedAt: null },
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
            include: {
              updatedBy: { select: { name: true } },
              movements: { orderBy: { createdAt: "desc" }, take: 1, include: { performer: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  return machines.map((machine) => ({
    id: machine.id,
    name: machine.name,
    description: machine.description,
    active: machine.archivedAt === null,
    updatedAt: machine.updatedAt.toISOString(),
    types: machine.types.map((type) => ({
      id: type.id,
      name: type.name,
      note: type.note,
      active: type.archivedAt === null,
      updatedAt: type.updatedAt.toISOString(),
      bits: type.bits.map((bit) => ({
        id: bit.id,
        label: bit.label,
        quantity: bit.quantity,
        updatedAt: bit.updatedAt.toISOString(),
        updatedByName: bit.movements[0]?.performer.name || bit.updatedBy?.name || "",
      })),
    })),
  }));
}

async function assertUniqueMachine(name: string, exceptId?: string) {
  const rows = await prisma.drillMachine.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
  if (rows.some((row) => row.id !== exceptId && sameName(row.name, name))) {
    throw new AppError("CONFLICT", "דגם מקדח בשם זה כבר קיים", 409);
  }
}

async function assertUniqueType(machineId: string, name: string, exceptId?: string) {
  const rows = await prisma.drillType.findMany({ where: { machineId, archivedAt: null }, select: { id: true, name: true } });
  if (rows.some((row) => row.id !== exceptId && sameName(row.name, name))) {
    throw new AppError("CONFLICT", "סוג מקדח בשם זה כבר קיים בדגם", 409);
  }
}

export async function createDrillMachine(input: { name: string; description?: string; active?: boolean }) {
  const name = cleanName(input.name, "שם דגם");
  await assertUniqueMachine(name);
  const last = await prisma.drillMachine.aggregate({ _max: { sortOrder: true } });
  await prisma.drillMachine.create({
    data: {
      name,
      description: cleanNote(input.description),
      sortOrder: (last._max.sortOrder ?? -1) + 1,
      archivedAt: input.active === false ? new Date() : null,
    },
  });
}

export async function createDrillType(input: { machineId: string; name: string; note?: string }) {
  const machine = await prisma.drillMachine.findUnique({ where: { id: input.machineId } });
  if (!machine || machine.archivedAt) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  const name = cleanName(input.name, "סוג חומר");
  await assertUniqueType(machine.id, name);
  const last = await prisma.drillType.aggregate({ where: { machineId: machine.id }, _max: { sortOrder: true } });
  await prisma.drillType.create({
    data: { machineId: machine.id, name, note: cleanNote(input.note), sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
}

async function assertUniqueBit(typeId: string, label: string, exceptId?: string) {
  const rows = await prisma.drillBit.findMany({ where: { typeId, archivedAt: null }, select: { id: true, label: true } });
  if (rows.some((row) => row.id !== exceptId && sameName(row.label, label))) {
    throw new AppError("CONFLICT", "מספר המקדח כבר קיים בחומר זה", 409);
  }
}

export async function createDrillBit(input: { typeId: string; label: string; quantity?: number; barcode?: string; userId: string }) {
  const type = await prisma.drillType.findUnique({ where: { id: input.typeId }, include: { machine: true } });
  if (!type || type.archivedAt || type.machine.archivedAt) throw new AppError("NOT_FOUND", "סוג החומר לא נמצא", 404);
  const label = cleanName(input.label, "מספר מקדח");
  const quantity = input.quantity ?? 0;
  if (!Number.isInteger(quantity) || quantity < 0) throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  await assertUniqueBit(type.id, label);
  const last = await prisma.drillBit.aggregate({ where: { typeId: type.id }, _max: { sortOrder: true } });
  const bit = await prisma.drillBit.create({
    data: { typeId: type.id, label, quantity: 0, sortOrder: (last._max.sortOrder ?? -1) + 1, updatedById: input.userId },
  });
  try {
    if (quantity > 0) await adjustDrillQuantity({ bitId: bit.id, delta: quantity, reason: "כמות התחלתית", userId: input.userId });
    if (input.barcode?.trim()) {
      await setInventoryBarcode({ module: "DRILLS", entityKind: "bit", entityId: bit.id, code: input.barcode, userId: input.userId });
    }
  } catch (error) {
    await prisma.drillStockMovement.deleteMany({ where: { bitId: bit.id } });
    await prisma.drillBit.delete({ where: { id: bit.id } });
    throw error;
  }
}

export async function renameDrillBit(id: string, label: string) {
  const bit = await prisma.drillBit.findUnique({ where: { id } });
  if (!bit || bit.archivedAt) throw new AppError("NOT_FOUND", "מספר המקדח לא נמצא", 404);
  const next = cleanName(label, "מספר מקדח");
  await assertUniqueBit(bit.typeId, next, id);
  await prisma.drillBit.update({ where: { id }, data: { label: next } });
}

export async function deleteDrillBit(id: string) {
  const bit = await prisma.drillBit.findUnique({ where: { id }, include: { _count: { select: { movements: true } } } });
  if (!bit || bit.archivedAt) throw new AppError("NOT_FOUND", "מספר המקדח לא נמצא", 404);
  if ((bit.quantity ?? 0) > 0) {
    throw new AppError("CONFLICT", "לא ניתן למחוק מספר מקדח כל עוד יש לו מלאי. אפשר להפחית את הכמות לאפס, והתנועות יישמרו.", 409);
  }
  if (bit._count.movements > 0) {
    await prisma.drillBit.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.drillBit.delete({ where: { id } });
  return { archived: false };
}

export async function adjustDrillQuantity(input: { bitId: string; delta?: number; quantity?: number; reason?: string; userId: string }) {
  const hasDelta = input.delta !== undefined;
  const hasQuantity = input.quantity !== undefined;
  if (hasDelta === hasQuantity) throw new AppError("VALIDATION_ERROR", "יש לבחור הוספה או קביעת כמות", 400);
  if (hasDelta && (!Number.isInteger(input.delta) || input.delta === 0)) throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  if (hasQuantity && (!Number.isInteger(input.quantity) || (input.quantity ?? 0) < 0)) throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  const reason = cleanNote(input.reason);
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ quantity: number | null }>>`
      SELECT quantity FROM "DrillBit" WHERE id = ${input.bitId} AND "archivedAt" IS NULL FOR UPDATE
    `;
    if (rows.length === 0) throw new AppError("NOT_FOUND", "פריט המלאי לא נמצא", 404);
    const before = rows[0]?.quantity ?? 0;
    const after = hasDelta ? before + (input.delta ?? 0) : (input.quantity ?? 0);
    if (after < 0) throw new AppError("VALIDATION_ERROR", "אין מספיק מלאי להפחתה", 400);
    if (after === before) return;
    const action = hasQuantity ? "SET" : (input.delta ?? 0) > 0 ? "IN" : "OUT";
    const stored = rows[0]?.quantity ?? null;
    const updated = await tx.$executeRaw`
      UPDATE "DrillBit" SET quantity = ${after}, "updatedAt" = CURRENT_TIMESTAMP, "updatedById" = ${input.userId}
      WHERE id = ${input.bitId} AND quantity IS NOT DISTINCT FROM ${stored}
    `;
    if (Number(updated) !== 1) throw new AppError("CONFLICT", "הכמות עודכנה במקביל. נסו שוב.", 409);
    await tx.drillStockMovement.create({
      data: {
        bitId: input.bitId,
        action,
        quantityBefore: before,
        quantityChange: after - before,
        quantityAfter: after,
        reason: reason || (action === "IN" ? "הוספת מלאי" : action === "OUT" ? "הפחתת מלאי" : "שינוי כמות"),
        performedBy: input.userId,
      },
    });
  });
}

export async function renameDrillNode(kind: "machine" | "type", id: string, name: string, description?: string) {
  const clean = cleanName(name, "שם");
  if (kind === "machine") {
    await assertUniqueMachine(clean, id);
    await prisma.drillMachine.update({
      where: { id },
      data: { name: clean, ...(description !== undefined ? { description: cleanNote(description) } : {}) },
    });
    return;
  }
  const type = await prisma.drillType.findUnique({ where: { id } });
  if (!type || type.archivedAt) throw new AppError("NOT_FOUND", "הסוג לא נמצא", 404);
  await assertUniqueType(type.machineId, clean, id);
  await prisma.drillType.update({ where: { id }, data: { name: clean, ...(description !== undefined ? { note: cleanNote(description) } : {}) } });
}

export async function setDrillActive(kind: "machine" | "type", id: string, active: boolean) {
  const data = { archivedAt: active ? null : new Date() };
  if (kind === "machine") await prisma.drillMachine.update({ where: { id }, data });
  else await prisma.drillType.update({ where: { id }, data });
}

export async function deleteDrillNode(kind: "machine" | "type", id: string) {
  if (kind === "type") {
    const type = await prisma.drillType.findUnique({
      where: { id },
      include: { bits: { include: { _count: { select: { movements: true } } } } },
    });
    if (!type || type.archivedAt) throw new AppError("NOT_FOUND", "הסוג לא נמצא", 404);
    const canonical = DRILL_TYPES.some((name) => sameName(name, type.name));
    const blocked = canonical || type.bits.some((bit) => bit._count.movements > 0 || (bit.quantity ?? 0) !== 0);
    if (blocked) {
      await prisma.drillBit.updateMany({ where: { typeId: id, archivedAt: null }, data: { archivedAt: new Date() } });
      await prisma.drillType.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.drillBit.deleteMany({ where: { typeId: id } });
    await prisma.drillType.delete({ where: { id } });
    return { archived: false };
  }
  const machine = await prisma.drillMachine.findUnique({ where: { id }, include: { _count: { select: { types: true } } } });
  if (!machine || machine.archivedAt) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  if (machine._count.types > 0) throw new AppError("CONFLICT", "לא ניתן למחוק דגם כל עוד קיימים סוגים", 409);
  if (DRILL_MODELS.some((name) => sameName(name, machine.name))) {
    await prisma.drillMachine.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.drillMachine.delete({ where: { id } });
  return { archived: false };
}
