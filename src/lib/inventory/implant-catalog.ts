import type { ImplantStockAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";

export type ImplantHeightNode = {
  id: string;
  label: string;
  quantity: number;
  minQuantity: number;
  sortOrder: number;
  archivedAt: string | null;
};

export type ImplantTypeNode = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  heights: ImplantHeightNode[];
};

export type ImplantModelNode = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  types: ImplantTypeNode[];
};

export type ImplantBrandNode = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  models: ImplantModelNode[];
};

export type ImplantSummary = {
  totalQuantity: number;
  modelCount: number;
  typeCount: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export type ImplantCatalog = {
  summary: ImplantSummary;
  brands: ImplantBrandNode[];
};

export type ImplantMovementRow = {
  id: string;
  action: ImplantStockAction;
  quantityBefore: number;
  quantity: number;
  delta: number;
  balanceAfter: number;
  reason: string;
  performedByName: string;
  createdAt: string;
};

const NAME_MAX = 80;

function cleanName(raw: string | undefined, label: string): string {
  const name = raw?.trim() ?? "";
  if (!name) throw new AppError("VALIDATION_ERROR", `חסר ${label}`, 400);
  if (name.length > NAME_MAX) throw new AppError("VALIDATION_ERROR", `${label} ארוך מדי`, 400);
  return name;
}

function cleanQuantity(value: number, label = "הכמות"): number {
  if (!Number.isInteger(value) || value < 0) throw new AppError("VALIDATION_ERROR", `${label} אינה תקינה`, 400);
  return value;
}

function duplicate(message: string): never {
  throw new AppError("CONFLICT", message, 409);
}

function mapHeight(row: {
  id: string;
  label: string;
  quantity: number;
  minQuantity: number;
  sortOrder: number;
  archivedAt: Date | null;
}): ImplantHeightNode {
  return {
    id: row.id,
    label: row.label,
    quantity: row.quantity,
    minQuantity: row.minQuantity,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export function implantStockState(height: Pick<ImplantHeightNode, "quantity" | "minQuantity">): "ok" | "low" | "out" {
  if (height.quantity === 0) return "out";
  if (height.minQuantity > 0 && height.quantity <= height.minQuantity) return "low";
  return "ok";
}

export async function getImplantCatalog(): Promise<ImplantCatalog> {
  const brands = await prisma.implantBrand.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      models: {
        orderBy: { sortOrder: "asc" },
        include: {
          types: {
            orderBy: { sortOrder: "asc" },
            include: { heights: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });

  const nodes = brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    sortOrder: brand.sortOrder,
    archivedAt: brand.archivedAt?.toISOString() ?? null,
    models: brand.models.map((model) => ({
      id: model.id,
      name: model.name,
      sortOrder: model.sortOrder,
      archivedAt: model.archivedAt?.toISOString() ?? null,
      types: model.types.map((type) => ({
        id: type.id,
        name: type.name,
        sortOrder: type.sortOrder,
        archivedAt: type.archivedAt?.toISOString() ?? null,
        heights: type.heights.map(mapHeight),
      })),
    })),
  }));

  const activeBrands = nodes.filter((brand) => !brand.archivedAt);
  const models = activeBrands.flatMap((brand) => brand.models.filter((model) => !model.archivedAt));
  const types = models.flatMap((model) => model.types.filter((type) => !type.archivedAt));
  const heights = types.flatMap((type) => type.heights.filter((height) => !height.archivedAt));

  return {
    summary: {
      totalQuantity: heights.reduce((sum, height) => sum + height.quantity, 0),
      modelCount: models.length,
      typeCount: types.length,
      lowStockCount: heights.filter((height) => implantStockState(height) === "low").length,
      outOfStockCount: heights.filter((height) => implantStockState(height) === "out").length,
    },
    brands: nodes,
  };
}

async function assertUniqueBrand(name: string, exceptId?: string) {
  const existing = await prisma.implantBrand.findFirst({
    where: { archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (existing) duplicate("כבר קיימת חברה בשם זה");
}

async function assertUniqueModel(brandId: string, name: string, exceptId?: string) {
  const existing = await prisma.implantModel.findFirst({
    where: { brandId, archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (existing) duplicate("כבר קיים דגם בשם זה בחברה");
}

async function assertUniqueType(modelId: string, name: string, exceptId?: string) {
  const existing = await prisma.implantType.findFirst({
    where: { modelId, archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (existing) duplicate("כבר קיים סוג בשם זה בדגם");
}

async function assertUniqueHeight(typeId: string, label: string, exceptId?: string) {
  const existing = await prisma.implantHeight.findFirst({
    where: { typeId, archivedAt: null, label: { equals: label, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (existing) duplicate("כבר קיים גובה זה בסוג");
}

async function nextSort(kind: "brand" | "model" | "type" | "height", parentId?: string): Promise<number> {
  if (kind === "brand") {
    const last = await prisma.implantBrand.aggregate({ where: { archivedAt: null }, _max: { sortOrder: true } });
    return (last._max.sortOrder ?? -1) + 1;
  }
  if (kind === "model") {
    const last = await prisma.implantModel.aggregate({ where: { brandId: parentId, archivedAt: null }, _max: { sortOrder: true } });
    return (last._max.sortOrder ?? -1) + 1;
  }
  if (kind === "type") {
    const last = await prisma.implantType.aggregate({ where: { modelId: parentId, archivedAt: null }, _max: { sortOrder: true } });
    return (last._max.sortOrder ?? -1) + 1;
  }
  const last = await prisma.implantHeight.aggregate({ where: { typeId: parentId, archivedAt: null }, _max: { sortOrder: true } });
  return (last._max.sortOrder ?? -1) + 1;
}

export async function createImplantBrand(name: string): Promise<void> {
  const clean = cleanName(name, "שם חברה");
  await assertUniqueBrand(clean);
  await prisma.implantBrand.create({ data: { name: clean, sortOrder: await nextSort("brand") } });
}

export async function renameImplantBrand(id: string, name: string): Promise<void> {
  const clean = cleanName(name, "שם חברה");
  const brand = await prisma.implantBrand.findUnique({ where: { id } });
  if (!brand) throw new AppError("NOT_FOUND", "החברה לא נמצאה", 404);
  await assertUniqueBrand(clean, id);
  await prisma.implantBrand.update({ where: { id }, data: { name: clean } });
}

export async function createImplantModel(brandId: string, name: string): Promise<void> {
  const brand = await prisma.implantBrand.findFirst({ where: { id: brandId, archivedAt: null } });
  if (!brand) throw new AppError("NOT_FOUND", "החברה לא נמצאה", 404);
  const clean = cleanName(name, "שם דגם");
  await assertUniqueModel(brandId, clean);
  await prisma.implantModel.create({ data: { brandId, name: clean, sortOrder: await nextSort("model", brandId) } });
}

export async function renameImplantModel(id: string, name: string): Promise<void> {
  const model = await prisma.implantModel.findUnique({ where: { id } });
  if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  const clean = cleanName(name, "שם דגם");
  await assertUniqueModel(model.brandId, clean, id);
  await prisma.implantModel.update({ where: { id }, data: { name: clean } });
}

export async function createImplantType(modelId: string, name: string): Promise<void> {
  const model = await prisma.implantModel.findFirst({ where: { id: modelId, archivedAt: null } });
  if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  const clean = cleanName(name, "שם סוג");
  await assertUniqueType(modelId, clean);
  await prisma.implantType.create({ data: { modelId, name: clean, sortOrder: await nextSort("type", modelId) } });
}

export async function renameImplantType(id: string, name: string): Promise<void> {
  const type = await prisma.implantType.findUnique({ where: { id } });
  if (!type) throw new AppError("NOT_FOUND", "הסוג לא נמצא", 404);
  const clean = cleanName(name, "שם סוג");
  await assertUniqueType(type.modelId, clean, id);
  await prisma.implantType.update({ where: { id }, data: { name: clean } });
}

export async function createImplantHeight(input: {
  typeId: string;
  label: string;
  quantity?: number;
  minQuantity?: number;
  performedBy: string;
  reason?: string;
}): Promise<void> {
  const type = await prisma.implantType.findFirst({ where: { id: input.typeId, archivedAt: null } });
  if (!type) throw new AppError("NOT_FOUND", "הסוג לא נמצא", 404);
  const label = cleanName(input.label, "גובה");
  await assertUniqueHeight(type.id, label);
  const quantity = cleanQuantity(input.quantity ?? 0);
  const minQuantity = cleanQuantity(input.minQuantity ?? 0, "כמות המינימום");
  const sortOrder = await nextSort("height", type.id);
  await prisma.$transaction(async (tx) => {
    const height = await tx.implantHeight.create({
      data: { typeId: type.id, label, quantity, minQuantity, sortOrder },
    });
    await tx.implantStockMovement.create({
      data: {
        heightId: height.id,
        action: "SET",
        quantityBefore: 0,
        quantity,
        delta: quantity,
        balanceAfter: quantity,
        reason: input.reason?.trim() ?? "",
        performedBy: input.performedBy,
      },
    });
  });
}

export async function updateImplantHeight(input: {
  id: string;
  label?: string;
  minQuantity?: number;
  quantity?: number;
  reason?: string;
  performedBy: string;
}): Promise<void> {
  const label = input.label !== undefined ? cleanName(input.label, "גובה") : undefined;
  const minQuantity = input.minQuantity !== undefined ? cleanQuantity(input.minQuantity, "כמות המינימום") : undefined;
  const quantity = input.quantity !== undefined ? cleanQuantity(input.quantity) : undefined;

  await prisma.$transaction(async (tx) => {
    const height = await tx.implantHeight.findUnique({ where: { id: input.id } });
    if (!height || height.archivedAt) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
    if (label !== undefined) await assertUniqueHeight(height.typeId, label, height.id);
    const data: { label?: string; minQuantity?: number; quantity?: number } = {};
    if (label !== undefined) data.label = label;
    if (minQuantity !== undefined) data.minQuantity = minQuantity;
    if (quantity !== undefined && quantity !== height.quantity) data.quantity = quantity;
    if (Object.keys(data).length === 0) return;
    if (data.quantity === undefined) {
      await tx.implantHeight.update({ where: { id: height.id }, data });
      return;
    }
    const updated = await tx.implantHeight.updateMany({
      where: { id: height.id, quantity: height.quantity, archivedAt: null },
      data,
    });
    if (updated.count !== 1) throw new AppError("CONFLICT", "הכמות עודכנה על ידי משתמש אחר. רעננו ונסו שוב.", 409);
    await tx.implantStockMovement.create({
      data: {
        heightId: height.id,
        action: "SET",
        quantityBefore: height.quantity,
        quantity: data.quantity,
        delta: data.quantity - height.quantity,
        balanceAfter: data.quantity,
        reason: input.reason?.trim() ?? "",
        performedBy: input.performedBy,
      },
    });
  });
}

export async function adjustImplantStock(input: {
  heightId: string;
  action: ImplantStockAction;
  quantity: number;
  reason?: string;
  performedBy: string;
}): Promise<void> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0) throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  if (input.action !== "SET" && input.quantity === 0) throw new AppError("VALIDATION_ERROR", "יש להזין כמות גדולה מאפס", 400);

  await prisma.$transaction(async (tx) => {
    const height = await tx.implantHeight.findUnique({ where: { id: input.heightId } });
    if (!height || height.archivedAt) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
    let next = height.quantity;
    let delta = 0;
    if (input.action === "IN") {
      delta = input.quantity;
      next = height.quantity + input.quantity;
    } else if (input.action === "OUT") {
      if (height.quantity < input.quantity) throw new AppError("VALIDATION_ERROR", "אין מספיק מלאי להפחתה", 400);
      delta = -input.quantity;
      next = height.quantity - input.quantity;
    } else if (input.action === "SET") {
      next = input.quantity;
      delta = input.quantity - height.quantity;
    } else {
      throw new AppError("VALIDATION_ERROR", "פעולת מלאי לא תקינה", 400);
    }
    if (next < 0) throw new AppError("VALIDATION_ERROR", "יתרה שלילית אינה מותרת", 400);
    const updated = await tx.implantHeight.updateMany({
      where: { id: height.id, quantity: height.quantity, archivedAt: null },
      data: { quantity: next },
    });
    if (updated.count !== 1) throw new AppError("CONFLICT", "הכמות עודכנה על ידי משתמש אחר. רעננו ונסו שוב.", 409);
    await tx.implantStockMovement.create({
      data: {
        heightId: height.id,
        action: input.action,
        quantityBefore: height.quantity,
        quantity: input.quantity,
        delta,
        balanceAfter: next,
        reason: input.reason?.trim() ?? "",
        performedBy: input.performedBy,
      },
    });
  });
}

function assertIds(existing: string[], orderedIds: string[], message: string) {
  if (orderedIds.length !== existing.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !existing.includes(id))) {
    throw new AppError("VALIDATION_ERROR", message, 400);
  }
}

export async function reorderImplant(kind: "brand" | "model" | "type" | "height", orderedIds: string[], parentId?: string): Promise<void> {
  if (kind === "brand") {
    const rows = await prisma.implantBrand.findMany({ where: { archivedAt: null }, select: { id: true } });
    assertIds(rows.map((row) => row.id), orderedIds, "סדר החברות אינו תקין");
    await prisma.$transaction(orderedIds.map((id, sortOrder) => prisma.implantBrand.update({ where: { id }, data: { sortOrder } })));
    return;
  }
  if (!parentId) throw new AppError("VALIDATION_ERROR", "חסר אב", 400);
  if (kind === "model") {
    const rows = await prisma.implantModel.findMany({ where: { brandId: parentId, archivedAt: null }, select: { id: true } });
    assertIds(rows.map((row) => row.id), orderedIds, "סדר הדגמים אינו תקין");
    await prisma.$transaction(orderedIds.map((id, sortOrder) => prisma.implantModel.update({ where: { id }, data: { sortOrder } })));
    return;
  }
  if (kind === "type") {
    const rows = await prisma.implantType.findMany({ where: { modelId: parentId, archivedAt: null }, select: { id: true } });
    assertIds(rows.map((row) => row.id), orderedIds, "סדר הסוגים אינו תקין");
    await prisma.$transaction(orderedIds.map((id, sortOrder) => prisma.implantType.update({ where: { id }, data: { sortOrder } })));
    return;
  }
  const rows = await prisma.implantHeight.findMany({ where: { typeId: parentId, archivedAt: null }, select: { id: true } });
  assertIds(rows.map((row) => row.id), orderedIds, "סדר הגבהים אינו תקין");
  await prisma.$transaction(orderedIds.map((id, sortOrder) => prisma.implantHeight.update({ where: { id }, data: { sortOrder } })));
}

export async function deleteImplantNode(kind: "brand" | "model" | "type" | "height", id: string): Promise<{ archived: boolean }> {
  if (kind === "brand") {
    const brand = await prisma.implantBrand.findUnique({ where: { id }, include: { models: { select: { archivedAt: true } } } });
    if (!brand) throw new AppError("NOT_FOUND", "החברה לא נמצאה", 404);
    if (brand.models.some((model) => !model.archivedAt)) {
      throw new AppError("CONFLICT", "לא ניתן למחוק חברה כל עוד קיימים דגמים פעילים.", 409);
    }
    if (brand.models.length > 0) {
      await prisma.implantBrand.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.implantBrand.delete({ where: { id } });
    return { archived: false };
  }
  if (kind === "model") {
    const model = await prisma.implantModel.findUnique({ where: { id }, include: { types: { select: { archivedAt: true } } } });
    if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    if (model.types.some((type) => !type.archivedAt)) {
      throw new AppError("CONFLICT", "לא ניתן למחוק דגם כל עוד קיימים סוגים פעילים.", 409);
    }
    if (model.types.length > 0) {
      await prisma.implantModel.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.implantModel.delete({ where: { id } });
    return { archived: false };
  }
  if (kind === "type") {
    const type = await prisma.implantType.findUnique({ where: { id }, include: { heights: { select: { archivedAt: true } } } });
    if (!type) throw new AppError("NOT_FOUND", "הסוג לא נמצא", 404);
    if (type.heights.some((height) => !height.archivedAt)) {
      throw new AppError("CONFLICT", "לא ניתן למחוק סוג כל עוד קיימים גבהים פעילים.", 409);
    }
    if (type.heights.length > 0) {
      await prisma.implantType.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.implantType.delete({ where: { id } });
    return { archived: false };
  }
  const height = await prisma.implantHeight.findUnique({ where: { id }, include: { _count: { select: { movements: true } } } });
  if (!height) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  if (height._count.movements > 0 || height.quantity > 0) {
    await prisma.implantHeight.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.implantHeight.delete({ where: { id } });
  return { archived: false };
}

export async function restoreImplantNode(kind: "brand" | "model" | "type" | "height", id: string): Promise<void> {
  if (kind === "brand") {
    const brand = await prisma.implantBrand.findUnique({ where: { id } });
    if (!brand) throw new AppError("NOT_FOUND", "החברה לא נמצאה", 404);
    await assertUniqueBrand(brand.name, brand.id);
    await prisma.implantBrand.update({ where: { id }, data: { archivedAt: null } });
    return;
  }
  if (kind === "model") {
    const model = await prisma.implantModel.findUnique({ where: { id } });
    if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    const brand = await prisma.implantBrand.findUnique({ where: { id: model.brandId } });
    if (!brand || brand.archivedAt) throw new AppError("CONFLICT", "יש לשחזר את החברה לפני שחזור הדגם", 409);
    await assertUniqueModel(model.brandId, model.name, model.id);
    await prisma.implantModel.update({ where: { id }, data: { archivedAt: null } });
    return;
  }
  if (kind === "type") {
    const type = await prisma.implantType.findUnique({ where: { id } });
    if (!type) throw new AppError("NOT_FOUND", "הסוג לא נמצא", 404);
    const model = await prisma.implantModel.findUnique({ where: { id: type.modelId } });
    if (!model || model.archivedAt) throw new AppError("CONFLICT", "יש לשחזר את הדגם לפני שחזור הסוג", 409);
    await assertUniqueType(type.modelId, type.name, type.id);
    await prisma.implantType.update({ where: { id }, data: { archivedAt: null } });
    return;
  }
  const height = await prisma.implantHeight.findUnique({ where: { id } });
  if (!height) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  const type = await prisma.implantType.findUnique({ where: { id: height.typeId } });
  if (!type || type.archivedAt) throw new AppError("CONFLICT", "יש לשחזר את הסוג לפני שחזור הגובה", 409);
  await assertUniqueHeight(height.typeId, height.label, height.id);
  await prisma.implantHeight.update({ where: { id }, data: { archivedAt: null } });
}

export async function listImplantMovements(heightId: string): Promise<ImplantMovementRow[]> {
  const rows = await prisma.implantStockMovement.findMany({
    where: { heightId },
    orderBy: { createdAt: "desc" },
    include: { performer: { select: { name: true } } },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    quantityBefore: row.quantityBefore,
    quantity: row.quantity,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    performedByName: row.performer.name,
    createdAt: row.createdAt.toISOString(),
  }));
}
