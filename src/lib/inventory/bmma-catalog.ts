import type { BmmaStockAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";

export type BmmaHeightNode = {
  id: string;
  label: string;
  quantity: number;
  minQuantity: number;
  sortOrder: number;
  archivedAt: string | null;
};

export type BmmaColorNode = {
  id: string;
  name: string;
  colorCode: string;
  sortOrder: number;
  archivedAt: string | null;
  heights: BmmaHeightNode[];
};

export type BmmaModelNode = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  colors: BmmaColorNode[];
};

export type BmmaSummary = {
  totalQuantity: number;
  colorCount: number;
  heightCount: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export type BmmaCatalog = {
  category: { id: string; name: string };
  summary: BmmaSummary;
  models: BmmaModelNode[];
  directColors: BmmaColorNode[];
};

export type BmmaMovementRow = {
  id: string;
  action: BmmaStockAction;
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

function duplicate(message: string): never {
  throw new AppError("CONFLICT", message, 409);
}

async function requireCategory() {
  const category = await prisma.bmmaCategory.findFirst({ orderBy: { createdAt: "asc" } });
  if (!category) throw new AppError("NOT_FOUND", "קטגוריית BMMA לא נמצאה", 404);
  return category;
}

function mapHeight(row: {
  id: string;
  label: string;
  quantity: number;
  minQuantity: number;
  sortOrder: number;
  archivedAt: Date | null;
}): BmmaHeightNode {
  return {
    id: row.id,
    label: row.label,
    quantity: row.quantity,
    minQuantity: row.minQuantity,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function mapColor(row: {
  id: string;
  name: string;
  colorCode: string;
  sortOrder: number;
  archivedAt: Date | null;
  heights: Array<{
    id: string;
    label: string;
    quantity: number;
    minQuantity: number;
    sortOrder: number;
    archivedAt: Date | null;
  }>;
}): BmmaColorNode {
  return {
    id: row.id,
    name: row.name,
    colorCode: row.colorCode,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    heights: row.heights.map(mapHeight),
  };
}

function summarize(colors: BmmaColorNode[]): BmmaSummary {
  const activeColors = colors.filter((color) => !color.archivedAt);
  const heights = activeColors.flatMap((color) => color.heights.filter((height) => !height.archivedAt));
  return {
    totalQuantity: heights.reduce((sum, height) => sum + height.quantity, 0),
    colorCount: activeColors.length,
    heightCount: heights.length,
    lowStockCount: heights.filter((height) => height.quantity > 0 && height.minQuantity > 0 && height.quantity <= height.minQuantity).length,
    outOfStockCount: heights.filter((height) => height.quantity === 0).length,
  };
}

export async function getBmmaCatalog(): Promise<BmmaCatalog> {
  const category = await requireCategory();
  const [models, directColors] = await Promise.all([
    prisma.bmmaModel.findMany({
      where: { categoryId: category.id },
      orderBy: { sortOrder: "asc" },
      include: {
        colors: {
          orderBy: { sortOrder: "asc" },
          include: { heights: { orderBy: { sortOrder: "asc" } } },
        },
      },
    }),
    prisma.bmmaColor.findMany({
      where: { categoryId: category.id, modelId: null },
      orderBy: { sortOrder: "asc" },
      include: { heights: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);

  const modelNodes = models.map((model) => ({
    id: model.id,
    name: model.name,
    sortOrder: model.sortOrder,
    archivedAt: model.archivedAt?.toISOString() ?? null,
    colors: model.colors.map(mapColor),
  }));
  const direct = directColors.map(mapColor);
  const allColors = [...direct, ...modelNodes.flatMap((model) => model.colors)];

  return {
    category: { id: category.id, name: category.name },
    summary: summarize(allColors),
    models: modelNodes,
    directColors: direct,
  };
}

async function assertUniqueModel(categoryId: string, name: string, exceptId?: string) {
  const existing = await prisma.bmmaModel.findFirst({
    where: {
      categoryId,
      archivedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (existing) duplicate("כבר קיים דגם בשם זה");
}

async function assertUniqueColor(categoryId: string, modelId: string | null, name: string, exceptId?: string) {
  const existing = await prisma.bmmaColor.findFirst({
    where: {
      categoryId,
      modelId,
      archivedAt: null,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (existing) duplicate("כבר קיים צבע בשם זה באותה רמה");
}

async function assertUniqueHeight(colorId: string, label: string, exceptId?: string) {
  const existing = await prisma.bmmaHeight.findFirst({
    where: {
      colorId,
      archivedAt: null,
      label: { equals: label, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (existing) duplicate("כבר קיים גובה זה בצבע");
}

export async function renameBmmaCategory(name: string): Promise<void> {
  const category = await requireCategory();
  await prisma.bmmaCategory.update({
    where: { id: category.id },
    data: { name: cleanName(name, "שם הקטגוריה") },
  });
}

export async function createBmmaModel(name: string): Promise<void> {
  const category = await requireCategory();
  const clean = cleanName(name, "שם דגם");
  await assertUniqueModel(category.id, clean);
  const last = await prisma.bmmaModel.aggregate({
    where: { categoryId: category.id, archivedAt: null },
    _max: { sortOrder: true },
  });
  await prisma.bmmaModel.create({
    data: { categoryId: category.id, name: clean, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
}

export async function renameBmmaModel(id: string, name: string): Promise<void> {
  const category = await requireCategory();
  const clean = cleanName(name, "שם דגם");
  const model = await prisma.bmmaModel.findFirst({ where: { id, categoryId: category.id } });
  if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  await assertUniqueModel(category.id, clean, id);
  await prisma.bmmaModel.update({ where: { id }, data: { name: clean } });
}

export async function createBmmaColor(input: { name: string; colorCode?: string; modelId?: string | null }): Promise<void> {
  const category = await requireCategory();
  const clean = cleanName(input.name, "שם צבע");
  const modelId = input.modelId ?? null;
  if (modelId) {
    const model = await prisma.bmmaModel.findFirst({ where: { id: modelId, categoryId: category.id, archivedAt: null } });
    if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  }
  await assertUniqueColor(category.id, modelId, clean);
  const last = await prisma.bmmaColor.aggregate({
    where: { categoryId: category.id, modelId, archivedAt: null },
    _max: { sortOrder: true },
  });
  await prisma.bmmaColor.create({
    data: {
      categoryId: category.id,
      modelId,
      name: clean,
      colorCode: input.colorCode?.trim() ?? "",
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateBmmaColor(input: { id: string; name?: string; colorCode?: string }): Promise<void> {
  const color = await prisma.bmmaColor.findUnique({ where: { id: input.id } });
  if (!color) throw new AppError("NOT_FOUND", "הצבע לא נמצא", 404);
  const data: { name?: string; colorCode?: string } = {};
  if (input.name !== undefined) {
    const clean = cleanName(input.name, "שם צבע");
    await assertUniqueColor(color.categoryId, color.modelId, clean, color.id);
    data.name = clean;
  }
  if (input.colorCode !== undefined) data.colorCode = input.colorCode.trim();
  await prisma.bmmaColor.update({ where: { id: color.id }, data });
}

export async function createBmmaHeight(input: { colorId: string; label: string; minQuantity?: number }): Promise<void> {
  const color = await prisma.bmmaColor.findFirst({ where: { id: input.colorId, archivedAt: null } });
  if (!color) throw new AppError("NOT_FOUND", "הצבע לא נמצא", 404);
  const label = cleanName(input.label, "גובה");
  await assertUniqueHeight(color.id, label);
  const minQuantity = input.minQuantity ?? 0;
  if (!Number.isInteger(minQuantity) || minQuantity < 0) {
    throw new AppError("VALIDATION_ERROR", "סף המינימום אינו תקין", 400);
  }
  const last = await prisma.bmmaHeight.aggregate({
    where: { colorId: color.id, archivedAt: null },
    _max: { sortOrder: true },
  });
  await prisma.bmmaHeight.create({
    data: { colorId: color.id, label, minQuantity, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
}

export async function updateBmmaHeight(input: { id: string; label?: string; minQuantity?: number }): Promise<void> {
  const height = await prisma.bmmaHeight.findUnique({ where: { id: input.id } });
  if (!height) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  const data: { label?: string; minQuantity?: number } = {};
  if (input.label !== undefined) {
    const label = cleanName(input.label, "גובה");
    await assertUniqueHeight(height.colorId, label, height.id);
    data.label = label;
  }
  if (input.minQuantity !== undefined) {
    if (!Number.isInteger(input.minQuantity) || input.minQuantity < 0) {
      throw new AppError("VALIDATION_ERROR", "סף המינימום אינו תקין", 400);
    }
    data.minQuantity = input.minQuantity;
  }
  await prisma.bmmaHeight.update({ where: { id: height.id }, data });
}

export async function reorderBmma(input: {
  kind: "model" | "color" | "height";
  orderedIds: string[];
  modelId?: string | null;
  colorId?: string;
}): Promise<void> {
  const category = await requireCategory();
  if (input.kind === "model") {
    const existing = await prisma.bmmaModel.findMany({
      where: { categoryId: category.id, archivedAt: null },
      select: { id: true },
    });
    assertIds(existing.map((row) => row.id), input.orderedIds, "סדר הדגמים אינו תקין");
    await prisma.$transaction(input.orderedIds.map((id, sortOrder) => prisma.bmmaModel.update({ where: { id }, data: { sortOrder } })));
    return;
  }
  if (input.kind === "color") {
    const modelId = input.modelId ?? null;
    const existing = await prisma.bmmaColor.findMany({
      where: { categoryId: category.id, modelId, archivedAt: null },
      select: { id: true },
    });
    assertIds(existing.map((row) => row.id), input.orderedIds, "סדר הצבעים אינו תקין");
    await prisma.$transaction(input.orderedIds.map((id, sortOrder) => prisma.bmmaColor.update({ where: { id }, data: { sortOrder } })));
    return;
  }
  if (!input.colorId) throw new AppError("VALIDATION_ERROR", "חסר צבע", 400);
  const existing = await prisma.bmmaHeight.findMany({
    where: { colorId: input.colorId, archivedAt: null },
    select: { id: true },
  });
  assertIds(existing.map((row) => row.id), input.orderedIds, "סדר הגבהים אינו תקין");
  await prisma.$transaction(input.orderedIds.map((id, sortOrder) => prisma.bmmaHeight.update({ where: { id }, data: { sortOrder } })));
}

function assertIds(existing: string[], orderedIds: string[], message: string) {
  if (orderedIds.length !== existing.length || new Set(orderedIds).size !== orderedIds.length) {
    throw new AppError("VALIDATION_ERROR", message, 400);
  }
  const known = new Set(existing);
  if (orderedIds.some((id) => !known.has(id))) throw new AppError("VALIDATION_ERROR", message, 400);
}

export async function deleteBmmaNode(kind: "model" | "color" | "height", id: string): Promise<{ archived: boolean }> {
  if (kind === "model") {
    const model = await prisma.bmmaModel.findUnique({
      where: { id },
      include: { colors: { select: { archivedAt: true } } },
    });
    if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    if (model.colors.some((color) => !color.archivedAt)) {
      throw new AppError("CONFLICT", "לא ניתן למחוק דגם כל עוד קיימים צבעים פעילים. מחקו או ארכבו אותם תחילה.", 409);
    }
    if (model.colors.length > 0) {
      await prisma.bmmaModel.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.bmmaModel.delete({ where: { id } });
    return { archived: false };
  }

  if (kind === "color") {
    const color = await prisma.bmmaColor.findUnique({
      where: { id },
      include: { heights: { select: { archivedAt: true } } },
    });
    if (!color) throw new AppError("NOT_FOUND", "הצבע לא נמצא", 404);
    if (color.heights.some((height) => !height.archivedAt)) {
      throw new AppError("CONFLICT", "לא ניתן למחוק צבע כל עוד קיימים גבהים פעילים. מחקו או ארכבו אותם תחילה.", 409);
    }
    if (color.heights.length > 0) {
      await prisma.bmmaColor.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.bmmaColor.delete({ where: { id } });
    return { archived: false };
  }

  const height = await prisma.bmmaHeight.findUnique({ where: { id }, include: { _count: { select: { movements: true } } } });
  if (!height) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  if (height._count.movements > 0 || height.quantity > 0) {
    await prisma.bmmaHeight.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.bmmaHeight.delete({ where: { id } });
  return { archived: false };
}

export async function restoreBmmaNode(kind: "model" | "color" | "height", id: string): Promise<void> {
  if (kind === "model") {
    const model = await prisma.bmmaModel.findUnique({ where: { id } });
    if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    await assertUniqueModel(model.categoryId, model.name, model.id);
    await prisma.bmmaModel.update({ where: { id }, data: { archivedAt: null } });
    return;
  }
  if (kind === "color") {
    const color = await prisma.bmmaColor.findUnique({ where: { id } });
    if (!color) throw new AppError("NOT_FOUND", "הצבע לא נמצא", 404);
    if (color.modelId) {
      const model = await prisma.bmmaModel.findUnique({ where: { id: color.modelId } });
      if (!model || model.archivedAt) throw new AppError("CONFLICT", "יש לשחזר את הדגם לפני שחזור הצבע", 409);
    }
    await assertUniqueColor(color.categoryId, color.modelId, color.name, color.id);
    await prisma.bmmaColor.update({ where: { id }, data: { archivedAt: null } });
    return;
  }
  const height = await prisma.bmmaHeight.findUnique({ where: { id } });
  if (!height) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  const color = await prisma.bmmaColor.findUnique({ where: { id: height.colorId } });
  if (!color || color.archivedAt) throw new AppError("CONFLICT", "יש לשחזר את הצבע לפני שחזור הגובה", 409);
  await assertUniqueHeight(height.colorId, height.label, height.id);
  await prisma.bmmaHeight.update({ where: { id }, data: { archivedAt: null } });
}

export async function adjustBmmaStock(input: {
  heightId: string;
  action: BmmaStockAction;
  quantity: number;
  reason?: string;
  performedBy: string;
}): Promise<void> {
  if (!Number.isInteger(input.quantity) || input.quantity < 0) {
    throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  }
  if (input.action !== "SET" && input.quantity === 0) {
    throw new AppError("VALIDATION_ERROR", "יש להזין כמות גדולה מאפס", 400);
  }
  const reason = input.reason?.trim() ?? "";
  if (!reason) throw new AppError("VALIDATION_ERROR", "חסרה סיבה", 400);

  await prisma.$transaction(async (tx) => {
    const height = await tx.bmmaHeight.findUnique({ where: { id: input.heightId } });
    if (!height || height.archivedAt) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
    let next = height.quantity;
    let delta = 0;
    if (input.action === "IN") {
      delta = input.quantity;
      next = height.quantity + input.quantity;
    } else if (input.action === "OUT") {
      if (height.quantity < input.quantity) {
        throw new AppError("VALIDATION_ERROR", "אין מספיק מלאי להפחתה", 400);
      }
      delta = -input.quantity;
      next = height.quantity - input.quantity;
    } else if (input.action === "SET") {
      delta = input.quantity - height.quantity;
      next = input.quantity;
    } else {
      throw new AppError("VALIDATION_ERROR", "פעולת מלאי לא תקינה", 400);
    }
    if (next < 0) throw new AppError("VALIDATION_ERROR", "יתרה שלילית אינה מותרת", 400);
    await tx.bmmaHeight.update({ where: { id: height.id }, data: { quantity: next } });
    await tx.bmmaMovement.create({
      data: {
        heightId: height.id,
        action: input.action,
        quantity: input.quantity,
        delta,
        balanceAfter: next,
        reason,
        performedBy: input.performedBy,
      },
    });
  });
}

export async function listBmmaMovements(heightId: string): Promise<BmmaMovementRow[]> {
  const rows = await prisma.bmmaMovement.findMany({
    where: { heightId },
    orderBy: { createdAt: "desc" },
    include: { performer: { select: { name: true } } },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    quantity: row.quantity,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    performedByName: row.performer.name,
    createdAt: row.createdAt.toISOString(),
  }));
}
