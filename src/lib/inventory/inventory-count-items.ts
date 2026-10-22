import type { InventoryModuleType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CountableItem = {
  id: string;
  name: string;
  modelName: string;
  kindName: string;
  colorName: string;
  sizeName: string;
  barcode: string;
  quantity: number | null;
  updatedAt?: string;
};

function byLabel(left: CountableItem, right: CountableItem) {
  return [left.modelName, left.kindName, left.colorName, left.sizeName, left.name]
    .join("\u0000")
    .localeCompare([right.modelName, right.kindName, right.colorName, right.sizeName, right.name].join("\u0000"), "he");
}

async function listCountableItemsRaw(type: InventoryModuleType): Promise<CountableItem[]> {
  if (type === "ZIRCONIA") {
    const rows = await prisma.zirconiaHeight.findMany({
      where: { archivedAt: null },
      include: {
        model: { select: { name: true } },
        color: { select: { name: true, variant: { select: { name: true } } } },
      },
    });
    return rows
      .map((row) => ({
        id: row.id,
        name: row.label,
        modelName: row.model.name,
        kindName: row.color?.variant?.name ?? (row.colorId ? "" : "ללא תת-דגם"),
        colorName: row.color?.name ?? "",
        sizeName: row.label,
        barcode: "",
        quantity: row.quantity,
      }))
      .sort(byLabel);
  }

  if (type === "TITANIUM") {
    const rows = await prisma.titaniumSize.findMany({
      where: { archivedAt: null, radius: { archivedAt: null, model: { archivedAt: null } } },
      include: { radius: { include: { model: { select: { name: true } } } } },
    });
    return rows
      .map((row) => ({
        id: row.id,
        name: row.label,
        modelName: row.radius.model.name,
        kindName: row.radius.name,
        colorName: "",
        sizeName: row.label,
        barcode: "",
        quantity: row.quantity,
      }))
      .sort(byLabel);
  }

  if (type === "BMMA") {
    const rows = await prisma.bmmaHeight.findMany({
      where: { archivedAt: null, color: { archivedAt: null } },
      include: { color: { include: { model: { select: { name: true } }, category: { select: { name: true } } } } },
    });
    return rows
      .map((row) => ({
        id: row.id,
        name: row.label,
        modelName: row.color.model?.name || row.color.category.name,
        kindName: row.color.model?.name ? row.color.category.name : "",
        colorName: row.color.name,
        sizeName: row.label,
        barcode: "",
        quantity: row.quantity,
      }))
      .sort(byLabel);
  }

  if (type === "DRILLS") {
    const rows = await prisma.drillBit.findMany({
      where: { archivedAt: null, type: { archivedAt: null, machine: { archivedAt: null } } },
      include: { type: { include: { machine: { select: { name: true } } } } },
    });
    return rows
      .map((row) => ({
        id: row.id,
        name: row.type.name,
        modelName: row.type.machine.name,
        kindName: row.type.name,
        colorName: "",
        sizeName: row.label === row.type.name ? "" : row.label,
        barcode: "",
        quantity: row.quantity,
        updatedAt: row.updatedAt.toISOString(),
      }))
      .sort(byLabel);
  }

  if (type === "IMPLANTS") {
    const rows = await prisma.implantHeight.findMany({
      where: { archivedAt: null, type: { archivedAt: null, model: { archivedAt: null, brand: { archivedAt: null } } } },
      include: { type: { include: { model: { include: { brand: { select: { name: true } } } } } } },
    });
    return rows
      .map((row) => ({
        id: row.id,
        name: row.label,
        modelName: row.type.model.brand.name,
        kindName: `${row.type.model.name} / ${row.type.name}`,
        colorName: "",
        sizeName: row.label,
        barcode: "",
        quantity: row.quantity,
      }))
      .sort(byLabel);
  }

  if (type === "CLINIC_MATERIALS" || type === "OTHER_MATERIALS") {
    const rows = await prisma.simpleStockItem.findMany({
      where: { kind: type, archivedAt: null },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      modelName: "",
      kindName: row.unit,
      colorName: "",
      sizeName: "",
      barcode: "",
      quantity: row.quantity,
    }));
  }

  const rows = await prisma.doctorPart.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    modelName: "",
    kindName: row.unit,
    colorName: "",
    sizeName: "",
    barcode: row.code,
    quantity: row.quantity,
  }));
}

export async function listCountableItems(type: InventoryModuleType): Promise<CountableItem[]> {
  const items = await listCountableItemsRaw(type);
  const codes = await prisma.inventoryScanCode.findMany({
    where: { module: type },
    select: { entityId: true, code: true },
  });
  const byId = new Map(codes.map((row) => [row.entityId, row.code]));
  return items.map((item) => ({ ...item, barcode: byId.get(item.id) || item.barcode }));
}
