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
      colors: { where: { archivedAt: null, variantId: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
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
      legacyColors: model.colors.map((color) => ({ id: color.id, name: color.name, sortOrder: color.sortOrder, heights: [] })),
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

export async function createZirconiaColor(input: { variantId: string; name: string }) {
  const variant = await prisma.zirconiaVariant.findUnique({ where: { id: input.variantId } });
  if (!variant || variant.archivedAt) throw new AppError("NOT_FOUND", "תת-הדגם לא נמצא", 404);
  const name = cleanRequired(input.name, "שם צבע");
  const clash = await prisma.zirconiaColor.findFirst({ where: { variantId: variant.id, name, archivedAt: null } });
  if (clash) throw new AppError("CONFLICT", "הצבע כבר קיים בתת-דגם זה", 409);
  const last = await prisma.zirconiaColor.aggregate({ where: { variantId: variant.id }, _max: { sortOrder: true } });
  await prisma.zirconiaColor.create({
    data: { modelId: variant.modelId, variantId: variant.id, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
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
  const color = await prisma.zirconiaColor.findUnique({ where: { id }, include: { _count: { select: { heights: true, products: true } } } });
  if (!color || color.archivedAt) throw new AppError("NOT_FOUND", "הצבע לא נמצא", 404);
  if (color._count.heights > 0 || color._count.products > 0) {
    throw new AppError("CONFLICT", "לא ניתן למחוק צבע כל עוד קיימים גבהים או מוצרים מקושרים.", 409);
  }
  await prisma.zirconiaColor.delete({ where: { id } });
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
    await writeHeightMovement(tx, {
      heightId: height.id,
      action: height.quantity === null ? "SET" : action,
      before,
      after: next,
      userId: input.userId,
      reason: input.reason ?? (input.count ? "ספירת מלאי" : height.quantity === null ? "הגדרת כמות" : undefined),
    });
  });
}

export async function deleteZirconiaHeight(id: string) {
  const height = await prisma.zirconiaHeight.findUnique({ where: { id }, include: { _count: { select: { movements: true, products: true } } } });
  if (!height || height.archivedAt) throw new AppError("NOT_FOUND", "הגובה לא נמצא", 404);
  if (height._count.products > 0) throw new AppError("CONFLICT", "לא ניתן למחוק גובה שמקושר למוצר.", 409);
  if (height._count.movements > 0) {
    await prisma.zirconiaHeight.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.zirconiaHeight.delete({ where: { id } });
  return { archived: false };
}
