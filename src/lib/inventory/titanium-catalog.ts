import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { TITANIUM_HUB_LAST_INDEX } from "@/lib/inventory/titanium-constants";

export { TITANIUM_HUB_LAST_INDEX } from "@/lib/inventory/titanium-constants";

export type TitaniumCatalogKind = "category" | "model" | "radius" | "size";

export type TitaniumSizeNode = {
  id: string;
  label: string;
  quantity: number | null;
  sortOrder: number;
  archivedAt: string | null;
};

export type TitaniumRadiusNode = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  sizes: TitaniumSizeNode[];
};

export type TitaniumModelNode = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  radii: TitaniumRadiusNode[];
};

export type TitaniumCategoryNode = {
  id: string;
  name: string;
  details: string;
  hubSortOrder: number;
  archivedAt: string | null;
};

export type TitaniumMutationResult = {
  archived: boolean;
};

const NAME_MAX = 80;
const DETAILS_MAX = 500;

function cleanName(raw: string | undefined, label: string): string {
  const name = raw?.trim() ?? "";
  if (!name) throw new AppError("VALIDATION_ERROR", `חסר ${label}`, 400);
  if (name.length > NAME_MAX) throw new AppError("VALIDATION_ERROR", `${label} ארוך מדי`, 400);
  return name;
}

function sameName(left: string, right: string) {
  return left.trim().toLocaleLowerCase("en") === right.trim().toLocaleLowerCase("en");
}

async function assertUniqueModel(categoryId: string, name: string, exceptId?: string) {
  const rows = await prisma.titaniumModel.findMany({ where: { categoryId, archivedAt: null }, select: { id: true, name: true } });
  if (rows.some((row) => row.id !== exceptId && sameName(row.name, name))) throw new AppError("CONFLICT", "דגם בשם זה כבר קיים", 409);
}

async function assertUniqueRadius(modelId: string, name: string, exceptId?: string) {
  const rows = await prisma.titaniumRadius.findMany({ where: { modelId, archivedAt: null }, select: { id: true, name: true } });
  if (rows.some((row) => row.id !== exceptId && sameName(row.name, name))) throw new AppError("CONFLICT", "רדיוס בשם זה כבר קיים בדגם", 409);
}

async function assertUniqueSize(radiusId: string, label: string, exceptId?: string) {
  const rows = await prisma.titaniumSize.findMany({ where: { radiusId, archivedAt: null }, select: { id: true, label: true } });
  if (rows.some((row) => row.id !== exceptId && sameName(row.label, label))) throw new AppError("CONFLICT", "גודל זה כבר קיים ברדיוס", 409);
}

function assertSameSet(existing: string[], orderedIds: string[], message: string) {
  if (orderedIds.length !== existing.length || new Set(orderedIds).size !== orderedIds.length) {
    throw new AppError("VALIDATION_ERROR", message, 400);
  }
  const known = new Set(existing);
  if (orderedIds.some((id) => !known.has(id))) {
    throw new AppError("VALIDATION_ERROR", message, 400);
  }
}

async function requireCategory() {
  const category = await prisma.titaniumCategory.findFirst({ orderBy: { createdAt: "asc" } });
  if (!category) throw new AppError("NOT_FOUND", "קטגוריית טיטניום לא נמצאה", 404);
  return category;
}

export async function getTitaniumCatalog(): Promise<{
  category: TitaniumCategoryNode;
  models: TitaniumModelNode[];
}> {
  const category = await requireCategory();
  const models = await prisma.titaniumModel.findMany({
    where: { categoryId: category.id },
    orderBy: { sortOrder: "asc" },
    include: {
      radii: {
        orderBy: { sortOrder: "asc" },
        include: { sizes: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  return {
    category: {
      id: category.id,
      name: category.name,
      details: category.details,
      hubSortOrder: category.hubSortOrder,
      archivedAt: category.archivedAt?.toISOString() ?? null,
    },
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      sortOrder: model.sortOrder,
      archivedAt: model.archivedAt?.toISOString() ?? null,
      radii: model.radii.map((radius) => ({
        id: radius.id,
        name: radius.name,
        sortOrder: radius.sortOrder,
        archivedAt: radius.archivedAt?.toISOString() ?? null,
        sizes: radius.sizes.map((size) => ({
          id: size.id,
          label: size.label,
          quantity: size.quantity,
          sortOrder: size.sortOrder,
          archivedAt: size.archivedAt?.toISOString() ?? null,
        })),
      })),
    })),
  };
}

export async function createTitaniumNode(input: {
  kind: Exclude<TitaniumCatalogKind, "category">;
  name?: string;
  modelId?: string;
  radiusId?: string;
}): Promise<void> {
  const category = await requireCategory();
  if (category.archivedAt) {
    throw new AppError("CONFLICT", "הקטגוריה בארכיון. יש לשחזר אותה לפני הוספה.", 409);
  }

  if (input.kind === "model") {
    const name = cleanName(input.name, "שם דגם");
    await assertUniqueModel(category.id, name);
    const last = await prisma.titaniumModel.aggregate({
      where: { categoryId: category.id, archivedAt: null },
      _max: { sortOrder: true },
    });
    await prisma.titaniumModel.create({
      data: { categoryId: category.id, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return;
  }

  if (input.kind === "radius") {
    const name = cleanName(input.name, "שם רדיוס");
    if (!input.modelId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
    const model = await prisma.titaniumModel.findFirst({
      where: { id: input.modelId, categoryId: category.id, archivedAt: null },
    });
    if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    await assertUniqueRadius(model.id, name);
    const last = await prisma.titaniumRadius.aggregate({
      where: { modelId: model.id, archivedAt: null },
      _max: { sortOrder: true },
    });
    await prisma.titaniumRadius.create({
      data: { modelId: model.id, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return;
  }

  const label = cleanName(input.name, "גודל");
  if (!input.radiusId) throw new AppError("VALIDATION_ERROR", "חסר רדיוס", 400);
  const radius = await prisma.titaniumRadius.findFirst({
    where: { id: input.radiusId, archivedAt: null, model: { archivedAt: null, categoryId: category.id } },
  });
  if (!radius) throw new AppError("NOT_FOUND", "הרדיוס לא נמצא", 404);
  await assertUniqueSize(radius.id, label);
  const last = await prisma.titaniumSize.aggregate({
    where: { radiusId: radius.id, archivedAt: null },
    _max: { sortOrder: true },
  });
  await prisma.titaniumSize.create({
    data: { radiusId: radius.id, label, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
}

export async function updateTitaniumCategory(input: {
  name?: string;
  details?: string;
  hubSortOrder?: number;
  archive?: boolean;
  restore?: boolean;
}): Promise<TitaniumMutationResult> {
  const category = await requireCategory();
  const data: {
    name?: string;
    details?: string;
    hubSortOrder?: number;
    archivedAt?: Date | null;
  } = {};

  if (input.name !== undefined) data.name = cleanName(input.name, "שם הקטגוריה");
  if (input.details !== undefined) {
    const details = input.details.trim();
    if (details.length > DETAILS_MAX) throw new AppError("VALIDATION_ERROR", "הפרטים ארוכים מדי", 400);
    data.details = details;
  }
  if (input.hubSortOrder !== undefined) {
    if (!Number.isInteger(input.hubSortOrder) || input.hubSortOrder < 0 || input.hubSortOrder > TITANIUM_HUB_LAST_INDEX) {
      throw new AppError("VALIDATION_ERROR", "מיקום התצוגה אינו תקין", 400);
    }
    data.hubSortOrder = input.hubSortOrder;
  }
  if (input.restore) data.archivedAt = null;
  if (input.archive) data.archivedAt = new Date();

  await prisma.titaniumCategory.update({ where: { id: category.id }, data });
  return { archived: Boolean(input.archive) };
}

export async function renameTitaniumNode(input: {
  kind: Exclude<TitaniumCatalogKind, "category">;
  id: string;
  name?: string;
}): Promise<void> {
  if (input.kind === "model") {
    const name = cleanName(input.name, "שם דגם");
    const model = await prisma.titaniumModel.findUnique({ where: { id: input.id } });
    if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    await assertUniqueModel(model.categoryId, name, model.id);
    const updated = await prisma.titaniumModel.updateMany({ where: { id: input.id }, data: { name } });
    if (updated.count === 0) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    return;
  }
  if (input.kind === "radius") {
    const name = cleanName(input.name, "שם רדיוס");
    const radius = await prisma.titaniumRadius.findUnique({ where: { id: input.id } });
    if (!radius) throw new AppError("NOT_FOUND", "הרדיוס לא נמצא", 404);
    await assertUniqueRadius(radius.modelId, name, radius.id);
    const updated = await prisma.titaniumRadius.updateMany({ where: { id: input.id }, data: { name } });
    if (updated.count === 0) throw new AppError("NOT_FOUND", "הרדיוס לא נמצא", 404);
    return;
  }
  const label = cleanName(input.name, "גודל");
  const size = await prisma.titaniumSize.findUnique({ where: { id: input.id } });
  if (!size) throw new AppError("NOT_FOUND", "הגודל לא נמצא", 404);
  await assertUniqueSize(size.radiusId, label, size.id);
  const updated = await prisma.titaniumSize.updateMany({ where: { id: input.id }, data: { label } });
  if (updated.count === 0) throw new AppError("NOT_FOUND", "הגודל לא נמצא", 404);
}

export async function restoreTitaniumNode(kind: Exclude<TitaniumCatalogKind, "category">, id: string): Promise<void> {
  if (kind === "model") {
    const row = await prisma.titaniumModel.findUnique({ where: { id } });
    if (!row) throw new AppError("NOT_FOUND", "הרשומה לא נמצאה", 404);
    await assertUniqueModel(row.categoryId, row.name, row.id);
  } else if (kind === "radius") {
    const row = await prisma.titaniumRadius.findUnique({ where: { id } });
    if (!row) throw new AppError("NOT_FOUND", "הרשומה לא נמצאה", 404);
    await assertUniqueRadius(row.modelId, row.name, row.id);
  } else {
    const row = await prisma.titaniumSize.findUnique({ where: { id } });
    if (!row) throw new AppError("NOT_FOUND", "הרשומה לא נמצאה", 404);
    await assertUniqueSize(row.radiusId, row.label, row.id);
  }
  const data = { archivedAt: null };
  const updated =
    kind === "model"
      ? await prisma.titaniumModel.updateMany({ where: { id }, data })
      : kind === "radius"
        ? await prisma.titaniumRadius.updateMany({ where: { id }, data })
        : await prisma.titaniumSize.updateMany({ where: { id }, data });
  if (updated.count === 0) throw new AppError("NOT_FOUND", "הרשומה לא נמצאה", 404);
}

export async function reorderTitaniumNodes(input: {
  kind: Exclude<TitaniumCatalogKind, "category">;
  orderedIds: string[];
  modelId?: string;
  radiusId?: string;
}): Promise<void> {
  if (input.kind === "model") {
    const category = await requireCategory();
    const existing = await prisma.titaniumModel.findMany({
      where: { categoryId: category.id, archivedAt: null },
      select: { id: true },
    });
    assertSameSet(existing.map((row) => row.id), input.orderedIds, "סדר הדגמים אינו תקין");
    await prisma.$transaction(
      input.orderedIds.map((id, sortOrder) => prisma.titaniumModel.update({ where: { id }, data: { sortOrder } })),
    );
    return;
  }

  if (input.kind === "radius") {
    if (!input.modelId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
    const existing = await prisma.titaniumRadius.findMany({
      where: { modelId: input.modelId, archivedAt: null },
      select: { id: true },
    });
    assertSameSet(existing.map((row) => row.id), input.orderedIds, "סדר הרדיוסים אינו תקין");
    await prisma.$transaction(
      input.orderedIds.map((id, sortOrder) => prisma.titaniumRadius.update({ where: { id }, data: { sortOrder } })),
    );
    return;
  }

  if (!input.radiusId) throw new AppError("VALIDATION_ERROR", "חסר רדיוס", 400);
  const existing = await prisma.titaniumSize.findMany({
    where: { radiusId: input.radiusId, archivedAt: null },
    select: { id: true },
  });
  assertSameSet(existing.map((row) => row.id), input.orderedIds, "סדר הגדלים אינו תקין");
  await prisma.$transaction(
    input.orderedIds.map((id, sortOrder) => prisma.titaniumSize.update({ where: { id }, data: { sortOrder } })),
  );
}

export async function deleteTitaniumNode(
  kind: Exclude<TitaniumCatalogKind, "category">,
  id: string,
): Promise<TitaniumMutationResult> {
  if (kind === "size") {
    const size = await prisma.titaniumSize.findUnique({ where: { id }, include: { _count: { select: { movements: true } } } });
    if (!size) throw new AppError("NOT_FOUND", "הגודל לא נמצא", 404);
    if (size.quantity != null || size._count.movements > 0) {
      await prisma.titaniumSize.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.titaniumSize.delete({ where: { id } });
    return { archived: false };
  }

  if (kind === "radius") {
    const radius = await prisma.titaniumRadius.findUnique({
      where: { id },
      include: { _count: { select: { sizes: true } } },
    });
    if (!radius) throw new AppError("NOT_FOUND", "הרדיוס לא נמצא", 404);
    if (radius._count.sizes > 0) {
      await prisma.titaniumRadius.update({ where: { id }, data: { archivedAt: new Date() } });
      return { archived: true };
    }
    await prisma.titaniumRadius.delete({ where: { id } });
    return { archived: false };
  }

  const model = await prisma.titaniumModel.findUnique({
    where: { id },
    include: { _count: { select: { radii: true } } },
  });
  if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  if (model._count.radii > 0) {
    await prisma.titaniumModel.update({ where: { id }, data: { archivedAt: new Date() } });
    return { archived: true };
  }
  await prisma.titaniumModel.delete({ where: { id } });
  return { archived: false };
}

export async function adjustTitaniumQuantity(input: {
  id: string;
  delta?: number;
  quantity?: number;
  count?: boolean;
  userId: string;
  reason?: string;
}): Promise<void> {
  const hasDelta = input.delta !== undefined;
  const hasAbsolute = input.quantity !== undefined;
  if (hasDelta === hasAbsolute) throw new AppError("VALIDATION_ERROR", "יש לבחור הוספה, הפחתה או כמות מדויקת", 400);
  if (input.count && !hasAbsolute) throw new AppError("VALIDATION_ERROR", "ספירה דורשת כמות מדויקת", 400);
  if (hasDelta && (!Number.isInteger(input.delta) || input.delta === 0)) {
    throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  }
  if (hasAbsolute && (!Number.isInteger(input.quantity) || (input.quantity as number) < 0)) {
    throw new AppError("VALIDATION_ERROR", "הכמות אינה תקינה", 400);
  }

  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ quantity: number | null }>>(
      Prisma.sql`SELECT quantity FROM "TitaniumSize" WHERE id = ${input.id} AND "archivedAt" IS NULL FOR UPDATE`,
    );
    if (rows.length === 0) throw new AppError("NOT_FOUND", "הגודל לא נמצא", 404);
    const raw = rows[0]?.quantity;
    const stored = raw === null || raw === undefined ? null : Number(raw);
    const before = stored ?? 0;
    const after = hasDelta ? before + (input.delta as number) : (input.quantity as number);
    if (!Number.isInteger(after) || after < 0) throw new AppError("VALIDATION_ERROR", "אין מספיק מלאי להפחתה", 400);
    if (stored !== null && after === stored) return;
    const updated = await tx.$executeRaw(
      Prisma.sql`UPDATE "TitaniumSize" SET quantity = ${after}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${input.id} AND quantity IS NOT DISTINCT FROM ${stored}`,
    );
    if (Number(updated) !== 1) throw new AppError("CONFLICT", "הכמות עודכנה במקביל. נסו שוב.", 409);
    const action = input.count ? "COUNT" : hasDelta ? ((input.delta as number) > 0 ? "IN" : "OUT") : "SET";
    const reason = input.reason?.trim()
      || (action === "IN" ? "הוספת מלאי" : action === "OUT" ? "הפחתת מלאי" : action === "COUNT" ? "ספירה" : "עריכת כמות");
    await tx.titaniumStockMovement.create({
      data: {
        sizeId: input.id,
        action,
        quantityBefore: before,
        quantityChange: after - before,
        quantityAfter: after,
        reason,
        performedBy: input.userId,
      },
    });
  });
}
