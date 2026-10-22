import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";

function cleanName(value: string | undefined, label: string) {
  const name = value?.trim() ?? "";
  if (!name) throw new AppError("VALIDATION_ERROR", `חסר ${label}`, 400);
  if (name.length > 80) throw new AppError("VALIDATION_ERROR", `${label} ארוך מדי`, 400);
  return name;
}

export async function listDrills() {
  const machines = await prisma.drillMachine.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      types: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { bits: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
      },
    },
  });
  return machines.map((machine) => ({
    id: machine.id,
    name: machine.name,
    types: machine.types.map((type) => ({
      id: type.id,
      name: type.name,
      bits: type.bits.map((bit) => ({ id: bit.id, label: bit.label, quantity: bit.quantity })),
    })),
  }));
}

export async function createDrillMachine(name: string) {
  const clean = cleanName(name, "שם מכונה");
  const last = await prisma.drillMachine.aggregate({ _max: { sortOrder: true } });
  await prisma.drillMachine.create({ data: { name: clean, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

export async function createDrillType(machineId: string, name: string) {
  const machine = await prisma.drillMachine.findUnique({ where: { id: machineId } });
  if (!machine || machine.archivedAt) throw new AppError("NOT_FOUND", "המכונה לא נמצאה", 404);
  const clean = cleanName(name, "סוג");
  const last = await prisma.drillType.aggregate({ where: { machineId }, _max: { sortOrder: true } });
  await prisma.drillType.create({ data: { machineId, name: clean, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

export async function createDrillBit(typeId: string, label: string, quantity: number | null) {
  const type = await prisma.drillType.findUnique({ where: { id: typeId } });
  if (!type || type.archivedAt) throw new AppError("NOT_FOUND", "הסוג לא נמצא", 404);
  const clean = cleanName(label, "מספר מקדח");
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  const last = await prisma.drillBit.aggregate({ where: { typeId }, _max: { sortOrder: true } });
  await prisma.drillBit.create({ data: { typeId, label: clean, quantity, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

export async function renameDrillNode(kind: "machine" | "type" | "bit", id: string, name: string) {
  const clean = cleanName(name, "שם");
  if (kind === "machine") await prisma.drillMachine.update({ where: { id }, data: { name: clean } });
  else if (kind === "type") await prisma.drillType.update({ where: { id }, data: { name: clean } });
  else await prisma.drillBit.update({ where: { id }, data: { label: clean } });
}

export async function deleteDrillNode(kind: "machine" | "type" | "bit", id: string) {
  if (kind === "bit") {
    const bit = await prisma.drillBit.findUnique({ where: { id }, include: { _count: { select: { movements: true } } } });
    if (!bit || bit.archivedAt) throw new AppError("NOT_FOUND", "המקדח לא נמצא", 404);
    if (bit._count.movements > 0) {
      await prisma.drillBit.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.drillBit.delete({ where: { id } });
    return { archived: false };
  }
  if (kind === "type") {
    const type = await prisma.drillType.findUnique({ where: { id }, include: { _count: { select: { bits: true } } } });
    if (!type || type.archivedAt) throw new AppError("NOT_FOUND", "הסוג לא נמצא", 404);
    if (type._count.bits > 0) throw new AppError("CONFLICT", "לא ניתן למחוק סוג כל עוד קיימים מקדחים", 409);
    await prisma.drillType.delete({ where: { id } });
    return { archived: false };
  }
  const machine = await prisma.drillMachine.findUnique({ where: { id }, include: { _count: { select: { types: true } } } });
  if (!machine || machine.archivedAt) throw new AppError("NOT_FOUND", "המכונה לא נמצאה", 404);
  if (machine._count.types > 0) throw new AppError("CONFLICT", "לא ניתן למחוק מכונה כל עוד קיימים סוגים", 409);
  await prisma.drillMachine.delete({ where: { id } });
  return { archived: false };
}
