import { Prisma, type ZirconiaStockAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";

const NAME_MAX = 80;
const STOCK_ATTRIBUTE_NAMES = new Set(["צבע", "אורך", "גובה"]);

export type ZirconiaHeightNode = {
  id: string;
  label: string;
  quantity: number | null;
  minQuantity: number | null;
  sortOrder: number;
};

export type ZirconiaColorNode = {
  id: string;
  name: string;
  sortOrder: number;
  heights: ZirconiaHeightNode[];
};

export type ZirconiaVariantNode = {
  id: string;
  name: string;
  sortOrder: number;
  colors: ZirconiaColorNode[];
};

export type ZirconiaStockModel = {
  id: string;
  name: string;
  sortOrder: number;
  variants: ZirconiaVariantNode[];
  legacyColors: ZirconiaColorNode[];
  legacyHeights: ZirconiaHeightNode[];
  legacyAttributes: { id: string; name: string }[];
};

export type ZirconiaMovementRow = {
  id: string;
  action: ZirconiaStockAction;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  userName: string;
  createdAt: string;
};

function cleanRequired(raw: string | undefined, label: string): string {
  const value = raw?.trim() ?? "";
  if (!value) throw new AppError("VALIDATION_ERROR", `חסר ${label}`, 400);
  if (value.length > NAME_MAX) throw new AppError("VALIDATION_ERROR", `${label} ארוך מדי`, 400);
  return value;
}

function assertInteger(value: number, message: string) {
  if (!Number.isInteger(value)) throw new AppError("VALIDATION_ERROR", message, 400);
}

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function mapHeight(row: { id: string; label: string; quantity: number | null; minQuantity: number | null; sortOrder: number }): ZirconiaHeightNode {
  return { id: row.id, label: row.label, quantity: row.quantity, minQuantity: row.minQuantity, sortOrder: row.sortOrder };
}

export async function listZirconiaStock(): Promise<ZirconiaStockModel[]> {
  const models = await prisma.zirconiaModel.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      variants: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          colors: {
            where: { archivedAt: null },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: {
              heights: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
            },
          },
        },
      },
      colors: {
        where: { archivedAt: null, variantId: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { heights: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
      },
      heights: { where: { archivedAt: null, colorId: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
      attributes: { orderBy: { sortOrder: "asc" } },
    },
  });

  return models.map((model) => {
    const promoted = new Set(model.variants.map((variant) => variant.sourceAttributeId).filter((id): id is string => Boolean(id)));
    return {
      id: model.id,
      name: model.name,
      sortOrder: model.sortOrder,
      variants: model.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sortOrder: variant.sortOrder,
        colors: variant.colors.map((color) => ({
          id: color.id,
          name: color.name,
          sortOrder: color.sortOrder,
          heights: color.heights.map(mapHeight),
        })),
      })),
      legacyColors: model.colors.map((color) => ({
        id: color.id,
        name: color.name,
        sortOrder: color.sortOrder,
        heights: color.heights.map(mapHeight),
      })),
      legacyHeights: model.heights.map(mapHeight),
      legacyAttributes: model.attributes
        .filter((attribute) => !STOCK_ATTRIBUTE_NAMES.has(attribute.name) && !promoted.has(attribute.id))
        .map((attribute) => ({ id: attribute.id, name: attribute.name })),
    };
  });
}

export async function listZirconiaMovements(heightId: string): Promise<ZirconiaMovementRow[]> {
  const rows = await prisma.zirconiaStockMovement.findMany({
    where: { heightId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { performer: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    quantityChange: row.quantityChange,
    quantityBefore: row.quantityBefore,
    quantityAfter: row.quantityAfter,
    reason: row.reason,
    userName: row.performer.name,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createZirconiaVariant(input: { modelId: string; name: string }) {
  const model = await prisma.zirconiaModel.findUnique({ where: { id: input.modelId } });
  if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  const name = cleanRequired(input.name, "שם תת-דגם");
  const existing = await prisma.zirconiaVariant.findFirst({ where: { modelId: input.modelId, name, archivedAt: null } });
  if (existing) throw new AppError("CONFLICT", "תת-הדגם כבר קיים", 409);
  const last = await prisma.zirconiaVariant.aggregate({ where: { modelId: input.modelId }, _max: { sortOrder: true } });
  await prisma.zirconiaVariant.create({ data: { modelId: input.modelId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

export async function renameZirconiaVariant(id: string, name: string) {
  const next = cleanRequired(name, "שם תת-דגם");
  const variant = await prisma.zirconiaVariant.findUnique({ where: { id } });
  if (!variant || variant.archivedAt) throw new AppError("NOT_FOUND", "תת-הדגם לא נמצא", 404);
  const clash = await prisma.zirconiaVariant.findFirst({ where: { modelId: variant.modelId, name: next, archivedAt: null, NOT: { id } } });
  if (clash) throw new AppError("CONFLICT", "תת-הדגם כבר קיים", 409);
  await prisma.zirconiaVariant.update({ where: { id }, data: { name: next } });
}

export async function reorderZirconiaVariants(modelId: string, orderedIds: string[]) {
  const existing = await prisma.zirconiaVariant.findMany({ where: { modelId, archivedAt: null }, select: { id: true } });
  if (orderedIds.length !== existing.length || new Set(orderedIds).size !== orderedIds.length) {
    throw new AppError("VALIDATION_ERROR", "סדר תתי-הדגמים אינו תקין", 400);
  }
  const known = new Set(existing.map((row) => row.id));
  if (orderedIds.some((id) => !known.has(id))) throw new AppError("VALIDATION_ERROR", "סדר תתי-הדגמים אינו תקין", 400);
  await prisma.$transaction(orderedIds.map((id, sortOrder) => prisma.zirconiaVariant.update({ where: { id }, data: { sortOrder } })));
}

export async function deleteZirconiaVariant(id: string) {
  const variant = await prisma.zirconiaVariant.findUnique({ where: { id }, include: { _count: { select: { colors: true } } } });
  if (!variant || variant.archivedAt) throw new AppError("NOT_FOUND", "תת-הדגם לא נמצא", 404);
  if (variant._count.colors > 0) throw new AppError("CONFLICT", "לא ניתן למחוק תת-דגם כל עוד קיימים צבעים. מחקו את הצבעים תחילה.", 409);
  await prisma.zirconiaVariant.delete({ where: { id } });
}

export async function createZirconiaColor(input: { variantId?: string; modelId?: string; name: string }) {
  const name = cleanRequired(input.name, "שם צבע");
  if (input.variantId) {
    const variant = await prisma.zirconiaVariant.findUnique({ where: { id: input.variantId } });
    if (!variant || variant.archivedAt) throw new AppError("NOT_FOUND", "תת-הדגם לא נמצא", 404);
    const clash = await prisma.zirconiaColor.findFirst({ where: { variantId: variant.id, name, archivedAt: null } });
    if (clash) throw new AppError("CONFLICT", "הצבע כבר קיים בתת-דגם זה", 409);
    const last = await prisma.zirconiaColor.aggregate({ where: { variantId: variant.id }, _max: { sortOrder: true } });
    await prisma.zirconiaColor.create({
      data: { modelId: variant.modelId, variantId: variant.id, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return;
  }
  if (!input.modelId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
  const model = await prisma.zirconiaModel.findUnique({ where: { id: input.modelId } });
  if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  const clash = await prisma.zirconiaColor.findFirst({ where: { modelId: model.id, variantId: null, name, archivedAt: null } });
  if (clash) throw new AppError("CONFLICT", "הצבע כבר קיים בדגם זה", 409);
  const last = await prisma.zirconiaColor.aggregate({ where: { modelId: model.id, variantId: null }, _max: { sortOrder: true } });
  await prisma.zirconiaColor.create({
    data: { modelId: model.id, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
}

export async function renameZirconiaColor(id: string, name: string) {
  const next = cleanRequired(name, "שם צבע");
  const color = await prisma.zirconiaColor.findUnique({ where: { id } });
  if (!color || color.archivedAt) throw new AppError("NOT_FOUND", "הצבע לא נמצא", 404);
  const clash = await prisma.zirconiaColor.findFirst({
    where: color.variantId
      ? { variantId: color.variantId, name: next, archivedAt: null, NOT: { id } }
      : { modelId: color.modelId, variantId: null, name: next, archivedAt: null, NOT: { id } },
  });
  if (clash) throw new AppError("CONFLICT", "הצבע כבר קיים", 409);
  await prisma.zirconiaColor.update({ where: { id }, data: { name: next } });
}

export async function deleteZirconiaColor(id: string) {
  const color = await prisma.zirconiaColor.findUnique({
    where: { id },
    include: {
      heights: { include: { _count: { select: { movements: true, products: true } } } },
      _count: { select: { products: true } },
    },
  });
  if (!color || color.archivedAt) throw new AppError("NOT_FOUND", "הצבע לא נמצא", 404);
  if (color._count.products > 0) throw new AppError("CONFLICT", "לא ניתן למחוק צבע שמקושר למוצר.", 409);
  const stocked = color.heights.some((height) => height.quantity != null || height._count.movements > 0 || height._count.products > 0);
  if (stocked) throw new AppError("CONFLICT", "לא ניתן למחוק צבע כל עוד קיימת כמות או היסטוריית מלאי.", 409);
  await prisma.$transaction(async (tx) => {
    if (color.heights.length > 0) await tx.zirconiaHeight.deleteMany({ where: { colorId: color.id, quantity: null } });
    await tx.zirconiaColor.delete({ where: { id: color.id } });
  });
}

export async function createZirconiaHeight(input: { colorId: string; label: string; quantity: number; minQuantity?: number | null; userId: string }) {
  assertInteger(input.quantity, "הכמות אינה תקינה");
  if (input.quantity < 0) throw new AppError("VALIDATION_ERROR", "הכמות אינה יכולה להיות שלילית", 400);
  if (input.minQuantity != null) {
    assertInteger(input.minQuantity, "כמות המינימום אינה תקינה");
    if (input.minQuantity < 0) throw new AppError("VALIDATION_ERROR", "כמות המינימום אינה יכולה להיות שלילית", 400);
  }
  const color = await prisma.zirconiaColor.findUnique({ where: { id: input.colorId } });
  if (!color || color.archivedAt) throw new AppError("NOT_FOUND", "הצבע לא נמצא", 404);
  const label = cleanRequired(input.label, "גובה");
  const clash = await prisma.zirconiaHeight.findFirst({ where: { colorId: color.id, label, archivedAt: null } });
  if (clash) throw new AppError("CONFLICT", "הגובה כבר קיים בצבע זה", 409);
  const last = await prisma.zirconiaHeight.aggregate({ where: { colorId: color.id }, _max: { sortOrder: true } });
  await prisma.$transaction(async (tx) => {
    const height = await tx.zirconiaHeight.create({
      data: {
        modelId: color.modelId,
        colorId: color.id,
        label,
        quantity: input.quantity,
        minQuantity: input.minQuantity ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    if (input.quantity !== 0) {
      await tx.zirconiaStockMovement.create({
        data: {
          heightId: height.id,
          action: "IN",
          quantityChange: input.quantity,
          quantityBefore: 0,
          quantityAfter: input.quantity,
          performedBy: input.userId,
          reason: "פתיחת גובה",
        },
      });
    }
  });
}

export async function renameZirconiaHeight(id: string, label: string, minQuantity?: number | null) {
  const height = await prisma.zirconiaHeight.findUnique({ where: { id } });
  if (!height || height.archivedAt) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  const next = cleanRequired(label, "גובה");
  if (minQuantity != null) {
    assertInteger(minQuantity, "כמות המינימום אינה תקינה");
    if (minQuantity < 0) throw new AppError("VALIDATION_ERROR", "כמות המינימום אינה יכולה להיות שלילית", 400);
  }
  const clash = await prisma.zirconiaHeight.findFirst({
    where: height.colorId
      ? { colorId: height.colorId, label: next, archivedAt: null, NOT: { id } }
      : { modelId: height.modelId, colorId: null, label: next, archivedAt: null, NOT: { id } },
  });
  if (clash) throw new AppError("CONFLICT", "הגובה כבר קיים", 409);
  await prisma.zirconiaHeight.update({
    where: { id },
    data: { label: next, ...(minQuantity !== undefined ? { minQuantity } : {}) },
  });
}

async function writeHeightMovement(
  tx: Prisma.TransactionClient,
  input: { heightId: string; action: ZirconiaStockAction; before: number; after: number; userId: string; reason?: string },
) {
  await tx.zirconiaStockMovement.create({
    data: {
      heightId: input.heightId,
      action: input.action,
      quantityChange: input.after - input.before,
      quantityBefore: input.before,
      quantityAfter: input.after,
      performedBy: input.userId,
      reason: input.reason?.trim() ?? "",
    },
  });
}

export async function adjustZirconiaHeight(input: {
  id: string;
  delta?: number;
  quantity?: number;
  count?: boolean;
  userId: string;
  reason?: string;
}) {
  if (input.delta !== undefined && input.quantity !== undefined) {
    throw new AppError("VALIDATION_ERROR", "יש לעדכן כמות באחת מהדרכים", 400);
  }
  await prisma.$transaction(async (tx) => {
    const height = await tx.zirconiaHeight.findUnique({ where: { id: input.id } });
    if (!height || height.archivedAt) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
    const before = height.quantity ?? 0;
    let next = before;
    let action: ZirconiaStockAction = "SET";
    if (input.delta !== undefined) {
      assertInteger(input.delta, "הכמות אינה תקינה");
      if (input.delta === 0) throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
      next = before + input.delta;
      action = input.delta > 0 ? "IN" : "OUT";
    } else if (input.quantity !== undefined) {
      assertInteger(input.quantity, "הכמות אינה תקינה");
      next = input.quantity;
      action = input.count ? "COUNT" : "SET";
    } else {
      throw new AppError("VALIDATION_ERROR", "חסרה כמות", 400);
    }
    if (next < 0) throw new AppError("VALIDATION_ERROR", "הכמות אינה יכולה להיות שלילית", 400);
    if (height.quantity !== null && next === height.quantity) return;
    const updated = await tx.zirconiaHeight.updateMany({
      where: { id: height.id, quantity: height.quantity, archivedAt: null },
      data: { quantity: next },
    });
    if (updated.count !== 1) throw new AppError("CONFLICT", "הכמות עודכנה במקביל. נסו שוב.", 409);
    const opening = height.quantity === null && input.delta === undefined;
    await writeHeightMovement(tx, {
      heightId: height.id,
      action: opening ? "SET" : action,
      before,
      after: next,
      userId: input.userId,
      reason: input.reason ?? (input.count ? "ספירת מלאי" : opening ? "הגדרת כמות" : undefined),
    });
  });
}

export async function addZirconiaHeightColumn(input: { colorIds: string[]; label: string }) {
  const label = cleanRequired(input.label, "גובה");
  const ids = [...new Set(input.colorIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new AppError("VALIDATION_ERROR", "יש להוסיף צבע לפני הוספת גובה", 400);
  const colors = await prisma.zirconiaColor.findMany({ where: { id: { in: ids }, archivedAt: null } });
  if (colors.length !== ids.length) throw new AppError("NOT_FOUND", "צבע לא נמצא", 404);
  const variantKey = colors[0]?.variantId ?? null;
  if (colors.some((color) => color.modelId !== colors[0]?.modelId || (color.variantId ?? null) !== variantKey)) {
    throw new AppError("VALIDATION_ERROR", "אי אפשר לערבב מלאי בין דגמים", 400);
  }
  const created = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const color of colors) {
      const clash = await tx.zirconiaHeight.findFirst({ where: { colorId: color.id, label, archivedAt: null } });
      if (clash) continue;
      const last = await tx.zirconiaHeight.aggregate({ where: { colorId: color.id }, _max: { sortOrder: true } });
      await tx.zirconiaHeight.create({
        data: {
          modelId: color.modelId,
          colorId: color.id,
          label,
          quantity: null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      count += 1;
    }
    return count;
  });
  if (created === 0) throw new AppError("CONFLICT", "הגובה כבר קיים בכל הצבעים", 409);
}

export async function renameZirconiaHeightColumn(ids: string[], label: string) {
  const next = cleanRequired(label, "גובה");
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) throw new AppError("VALIDATION_ERROR", "חסר גובה", 400);
  const rows = await prisma.zirconiaHeight.findMany({ where: { id: { in: unique }, archivedAt: null } });
  if (rows.length !== unique.length) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      if (row.label === next) continue;
      const clash = await tx.zirconiaHeight.findFirst({
        where: row.colorId
          ? { colorId: row.colorId, label: next, archivedAt: null, NOT: { id: row.id } }
          : { modelId: row.modelId, colorId: null, label: next, archivedAt: null, NOT: { id: row.id } },
      });
      if (clash) throw new AppError("CONFLICT", "הגובה כבר קיים", 409);
      await tx.zirconiaHeight.update({ where: { id: row.id }, data: { label: next } });
    }
  });
}

export async function deleteZirconiaHeightColumn(ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) throw new AppError("VALIDATION_ERROR", "חסר גובה", 400);
  const rows = await prisma.zirconiaHeight.findMany({
    where: { id: { in: unique }, archivedAt: null },
    include: { _count: { select: { movements: true, products: true } } },
  });
  if (rows.length !== unique.length) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  if (rows.some((row) => row.quantity != null || row._count.movements > 0 || row._count.products > 0)) {
    throw new AppError("CONFLICT", "לא ניתן להסיר גובה כל עוד קיימת כמות או היסטוריית מלאי.", 409);
  }
  await prisma.zirconiaHeight.deleteMany({ where: { id: { in: unique }, quantity: null } });
}

export async function deleteZirconiaHeight(id: string) {
  const height = await prisma.zirconiaHeight.findUnique({ where: { id }, include: { _count: { select: { movements: true, products: true } } } });
  if (!height || height.archivedAt) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  if (height._count.products > 0) throw new AppError("CONFLICT", "לא ניתן למחוק גובה שמקושר למוצר.", 409);
  if (height.quantity != null && height.quantity > 0) throw new AppError("CONFLICT", "לא ניתן למחוק גובה כל עוד יש לו מלאי.", 409);
  if (height.quantity === 0) throw new AppError("CONFLICT", "לא ניתן למחוק גובה עם כמות רשומה. המלאי לא נמחק.", 409);
  if (height._count.movements > 0) {
    await prisma.zirconiaHeight.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.zirconiaHeight.delete({ where: { id } });
  return { archived: false };
}
