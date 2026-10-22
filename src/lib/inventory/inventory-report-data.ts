import type { InventoryCountStatus, InventoryModuleType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INVENTORY_TYPE_LABELS } from "@/lib/constants/labels";
import { MODULE_LABELS, type ReportModule } from "@/lib/inventory/inventory-reports";

export type ReportProduct = {
  id: string;
  module: ReportModule;
  category: string;
  subcategory: string;
  model: string;
  material: string;
  color: string;
  size: string;
  name: string;
  barcode: string;
  quantity: number | null;
  minQuantity: number | null;
  unit: string;
  updatedAt: string;
  imagePath: string | null;
};

export type ReportCountLine = {
  countId: string;
  itemId: string;
  name: string;
  modelName: string;
  kindName: string;
  colorName: string;
  sizeName: string;
  barcode: string;
  notes: string;
  quantityAtStart: number | null;
  countedQuantity: number | null;
  quantityBeforeApproval: number | null;
  difference: number | null;
  quantityAfter: number | null;
};

export type ReportCount = {
  id: string;
  module: InventoryModuleType;
  category: string;
  serial: number;
  status: InventoryCountStatus;
  notes: string;
  counterName: string;
  location: string;
  createdById: string;
  createdByName: string;
  approvedByName: string;
  createdAt: string;
  approvedAt: string | null;
  cancelledAt: string | null;
  lines: ReportCountLine[];
};

export type ReportMovement = {
  id: string;
  category: string;
  itemId: string;
  itemName: string;
  action: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  source: string;
  userName: string;
  createdAt: string;
};

const ACTION_LABEL: Record<string, string> = {
  IN: "הוספת מלאי",
  OUT: "הפחתת מלאי",
  SET: "שינוי ידני",
  COUNT: "ספירת מלאי",
  STOCK_IN: "הוספת מלאי",
  STOCK_OUT: "הפחתת מלאי",
  STOCK_COUNT: "ספירת מלאי",
  ORDER_CONSUMPTION: "הפחתה מהזמנה",
  ORDER_ADJUSTMENT: "התאמת הזמנה",
  ORDER_RETURN: "החזרה מהזמנה",
  MANUAL_CORRECTION: "שינוי ידני",
};

function productName(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join(" / ");
}

export async function listReportProducts(): Promise<ReportProduct[]> {
  const [zirconia, titanium, bmma, drills, implants, simple, parts, classic] = await Promise.all([
    prisma.zirconiaHeight.findMany({
      where: { archivedAt: null },
      include: { model: { select: { name: true } }, color: { select: { name: true, variant: { select: { name: true } } } } },
    }),
    prisma.titaniumSize.findMany({
      where: { archivedAt: null, radius: { archivedAt: null, model: { archivedAt: null } } },
      include: { radius: { include: { model: { select: { name: true } } } } },
    }),
    prisma.bmmaHeight.findMany({
      where: { archivedAt: null, color: { archivedAt: null } },
      include: { color: { include: { model: { select: { name: true } }, category: { select: { name: true } } } } },
    }),
    prisma.drillBit.findMany({
      where: { archivedAt: null, type: { archivedAt: null, machine: { archivedAt: null } } },
      include: { type: { include: { machine: { select: { name: true } } } } },
    }),
    prisma.implantHeight.findMany({
      where: { archivedAt: null, type: { archivedAt: null, model: { archivedAt: null, brand: { archivedAt: null } } } },
      include: { type: { include: { model: { include: { brand: { select: { name: true } } } } } } },
    }),
    prisma.simpleStockItem.findMany({ where: { archivedAt: null } }),
    prisma.doctorPart.findMany({ where: { archivedAt: null } }),
    prisma.inventoryItem.findMany({ where: { isActive: true } }),
  ]);

  const rows: ReportProduct[] = [
    ...zirconia.map((row) => ({
      id: row.id,
      module: "ZIRCONIA" as const,
      category: MODULE_LABELS.ZIRCONIA,
      subcategory: row.color?.variant?.name || (row.colorId ? "" : "ללא תת-דגם"),
      model: row.model.name,
      material: row.color?.variant?.name ?? "",
      color: row.color?.name ?? "",
      size: row.label,
      name: productName([row.model.name, row.color?.variant?.name ?? "", row.color?.name ?? "", row.label]),
      barcode: "",
      quantity: row.quantity,
      minQuantity: row.minQuantity,
      unit: "יחידה",
      updatedAt: row.updatedAt.toISOString(),
      imagePath: null,
    })),
    ...titanium.map((row) => ({
      id: row.id,
      module: "TITANIUM" as const,
      category: MODULE_LABELS.TITANIUM,
      subcategory: row.radius.name,
      model: row.radius.model.name,
      material: "",
      color: "",
      size: row.label,
      name: productName([row.radius.model.name, row.radius.name, row.label]),
      barcode: "",
      quantity: row.quantity,
      minQuantity: null,
      unit: "יחידה",
      updatedAt: row.updatedAt.toISOString(),
      imagePath: null,
    })),
    ...bmma.map((row) => ({
      id: row.id,
      module: "BMMA" as const,
      category: row.color.category.name || MODULE_LABELS.BMMA,
      subcategory: row.color.model?.name ?? "",
      model: row.color.model?.name || row.color.category.name,
      material: row.color.category.name,
      color: row.color.name,
      size: row.label,
      name: productName([row.color.category.name, row.color.model?.name ?? "", row.color.name, row.label]),
      barcode: "",
      quantity: row.quantity,
      minQuantity: row.minQuantity,
      unit: "יחידה",
      updatedAt: row.updatedAt.toISOString(),
      imagePath: null,
    })),
    ...drills.map((row) => ({
      id: row.id,
      module: "DRILLS" as const,
      category: MODULE_LABELS.DRILLS,
      subcategory: row.type.name,
      model: row.type.machine.name,
      material: row.type.name,
      color: "",
      size: row.label === row.type.name ? "" : row.label,
      name: productName([row.type.machine.name, row.type.name, row.label === row.type.name ? "" : row.label]),
      barcode: "",
      quantity: row.quantity,
      minQuantity: null,
      unit: "יחידה",
      updatedAt: row.updatedAt.toISOString(),
      imagePath: null,
    })),
    ...implants.map((row) => ({
      id: row.id,
      module: "IMPLANTS" as const,
      category: MODULE_LABELS.IMPLANTS,
      subcategory: row.type.model.name,
      model: row.type.model.brand.name,
      material: row.type.name,
      color: "",
      size: row.label,
      name: productName([row.type.model.brand.name, row.type.model.name, row.type.name, row.label]),
      barcode: "",
      quantity: row.quantity,
      minQuantity: row.minQuantity,
      unit: "יחידה",
      updatedAt: row.updatedAt.toISOString(),
      imagePath: null,
    })),
    ...simple.map((row) => ({
      id: row.id,
      module: row.kind,
      category: MODULE_LABELS[row.kind],
      subcategory: "",
      model: "",
      material: "",
      color: "",
      size: "",
      name: row.name,
      barcode: "",
      quantity: row.quantity,
      minQuantity: null,
      unit: row.unit || "יחידה",
      updatedAt: row.updatedAt.toISOString(),
      imagePath: null,
    })),
    ...parts.map((row) => ({
      id: row.id,
      module: "DOCTOR_PARTS" as const,
      category: MODULE_LABELS.DOCTOR_PARTS,
      subcategory: "",
      model: "",
      material: "",
      color: "",
      size: "",
      name: row.name,
      barcode: row.code,
      quantity: row.quantity,
      minQuantity: null,
      unit: row.unit || "יחידה",
      updatedAt: row.updatedAt.toISOString(),
      imagePath: null,
    })),
    ...classic.map((row) => ({
      id: row.id,
      module: "CLASSIC" as const,
      category: INVENTORY_TYPE_LABELS[row.inventoryType] ?? row.inventoryType,
      subcategory: "",
      model: "",
      material: "",
      color: "",
      size: "",
      name: row.name,
      barcode: row.barcode,
      quantity: row.quantity,
      minQuantity: row.minQuantity,
      unit: row.unit || "יחידה",
      updatedAt: row.updatedAt.toISOString(),
      imagePath: row.storagePath || (row.imageUrl && !row.imageUrl.startsWith("http") ? row.imageUrl : null),
    })),
  ];

  const decorated = await applyStoredMedia(rows);
  return decorated.sort((left, right) => [left.category, left.model, left.subcategory, left.color, left.size, left.name].join("\u0000").localeCompare([right.category, right.model, right.subcategory, right.color, right.size, right.name].join("\u0000"), "he"));
}

async function applyStoredMedia(rows: ReportProduct[]) {
  const [images, codes] = await Promise.all([
    prisma.inventoryImage.findMany({ where: { isPrimary: true }, select: { entityId: true, storagePath: true } }),
    prisma.inventoryScanCode.findMany({ select: { entityId: true, code: true } }),
  ]);
  const imageById = new Map(images.map((row) => [row.entityId, row.storagePath]));
  const codeById = new Map(codes.map((row) => [row.entityId, row.code]));
  return rows.map((row) => ({
    ...row,
    imagePath: row.imagePath || imageById.get(row.id) || null,
    barcode: codeById.get(row.id) || row.barcode,
  }));
}

export async function listReportCounts(): Promise<ReportCount[]> {
  const counts = await prisma.inventoryCount.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      lines: true,
    },
  });
  return counts.map((count) => ({
    id: count.id,
    module: count.inventoryType,
    category: MODULE_LABELS[count.inventoryType],
    serial: count.serial,
    status: count.status,
    notes: count.notes,
    counterName: count.counterName,
    location: count.location,
    createdById: count.createdById,
    createdByName: count.createdBy.name,
    approvedByName: count.approvedBy?.name ?? "",
    createdAt: count.createdAt.toISOString(),
    approvedAt: count.approvedAt?.toISOString() ?? null,
    cancelledAt: count.cancelledAt?.toISOString() ?? null,
    lines: count.lines.map((line) => ({
      countId: line.countId,
      itemId: line.itemId,
      name: line.name,
      modelName: line.modelName,
      kindName: line.kindName,
      colorName: line.colorName,
      sizeName: line.sizeName,
      barcode: line.barcode,
      notes: line.notes,
      quantityAtStart: line.quantityAtStart,
      countedQuantity: line.countedQuantity,
      quantityBeforeApproval: line.quantityBeforeApproval,
      difference: line.difference,
      quantityAfter: line.quantityAfter,
    })),
  }));
}

function movementWhere(from?: Date, to?: Date) {
  const createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  return Object.keys(createdAt).length > 0 ? { createdAt } : {};
}

export async function listReportMovements(from?: Date, to?: Date): Promise<ReportMovement[]> {
  const where = movementWhere(from, to);
  const [zirconia, titanium, bmma, drills, implants, simple, parts] = await Promise.all([
    prisma.zirconiaStockMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000, include: { performer: { select: { name: true } }, height: { select: { label: true } } } }),
    prisma.titaniumStockMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000, include: { performer: { select: { name: true } }, size: { select: { label: true } } } }),
    prisma.bmmaMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000, include: { performer: { select: { name: true } }, height: { select: { label: true } } } }),
    prisma.drillStockMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000, include: { performer: { select: { name: true } }, bit: { select: { label: true } } } }),
    prisma.implantStockMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000, include: { performer: { select: { name: true } }, height: { select: { label: true } } } }),
    prisma.simpleStockMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000, include: { performer: { select: { name: true } }, item: { select: { name: true, kind: true } } } }),
    prisma.doctorPartMovement.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000, include: { user: { select: { name: true } }, part: { select: { name: true } } } }),
  ]);
  const rows: ReportMovement[] = [
    ...zirconia.map((row) => movement("זרקוניה", row.heightId ?? row.id, row.height?.label ?? "", row.action, row.quantityBefore, row.quantityChange, row.quantityAfter, row.countId ? "ספירה" : "מלאי", row.performer.name, row.createdAt, row.id)),
    ...titanium.map((row) => movement("טיטניום", row.sizeId, row.size.label, row.action, row.quantityBefore, row.quantityChange, row.quantityAfter, row.countId ? "ספירה" : "מלאי", row.performer.name, row.createdAt, row.id)),
    ...bmma.map((row) => movement("BMMA", row.heightId, row.height.label, row.action, row.balanceAfter - row.delta, row.delta, row.balanceAfter, row.countId ? "ספירה" : "מלאי", row.performer.name, row.createdAt, row.id)),
    ...drills.map((row) => movement("מקדחים", row.bitId, row.bit.label, row.action, row.quantityBefore, row.quantityChange, row.quantityAfter, row.countId ? "ספירה" : "מלאי", row.performer.name, row.createdAt, row.id)),
    ...implants.map((row) => movement("שתלים", row.heightId, row.height.label, row.action, row.quantityBefore, row.delta, row.balanceAfter, row.countId ? "ספירה" : "מלאי", row.performer.name, row.createdAt, row.id)),
    ...simple.map((row) => movement(MODULE_LABELS[row.item.kind], row.itemId, row.item.name, row.action, row.balanceAfter - row.delta, row.delta, row.balanceAfter, row.countId ? "ספירה" : "מלאי", row.performer.name, row.createdAt, row.id)),
    ...parts.map((row) => movement("חלקים רופאים", row.partId, row.part.name, row.type, row.quantityBefore, row.quantityChange, row.quantityAfter, row.orderSerial || (row.countId ? "ספירה" : row.source), row.user.name, row.createdAt, row.id)),
  ];
  return rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 5000);
}

function movement(category: string, itemId: string, itemName: string, action: string, quantityBefore: number, quantityChange: number, quantityAfter: number, source: string, userName: string, createdAt: Date, id: string): ReportMovement {
  return { id, category, itemId, itemName, action: ACTION_LABEL[action] ?? action, quantityBefore, quantityChange, quantityAfter, source, userName, createdAt: createdAt.toISOString() };
}
