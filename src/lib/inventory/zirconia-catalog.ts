import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";

export type ZirconiaCatalogKind = "model" | "attribute" | "value";

export type ZirconiaValueNode = {
  id: string;
  label: string;
  sortOrder: number;
};

export type ZirconiaAttributeNode = {
  id: string;
  name: string;
  sortOrder: number;
  values: ZirconiaValueNode[];
};

export type ZirconiaModelNode = {
  id: string;
  name: string;
  sortOrder: number;
  attributes: ZirconiaAttributeNode[];
};

const NAME_MAX = 80;

function cleanName(raw: string | undefined, label: string): string {
  const name = raw?.trim() ?? "";
  if (!name) throw new AppError("VALIDATION_ERROR", `חסר ${label}`, 400);
  if (name.length > NAME_MAX) {
    throw new AppError("VALIDATION_ERROR", `${label} ארוך מדי`, 400);
  }
  return name;
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

export async function listZirconiaCatalog(): Promise<ZirconiaModelNode[]> {
  const models = await prisma.zirconiaModel.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      attributes: {
        orderBy: { sortOrder: "asc" },
        include: { values: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  return models.map((model) => ({
    id: model.id,
    name: model.name,
    sortOrder: model.sortOrder,
    attributes: model.attributes.map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      sortOrder: attribute.sortOrder,
      values: attribute.values.map((value) => ({
        id: value.id,
        label: value.label,
        sortOrder: value.sortOrder,
      })),
    })),
  }));
}

export async function createZirconiaNode(input: {
  kind: ZirconiaCatalogKind;
  name?: string;
  modelId?: string;
  attributeId?: string;
}): Promise<void> {
  if (input.kind === "model") {
    const name = cleanName(input.name, "שם דגם");
    const last = await prisma.zirconiaModel.aggregate({ _max: { sortOrder: true } });
    await prisma.zirconiaModel.create({
      data: { name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return;
  }

  if (input.kind === "attribute") {
    const name = cleanName(input.name, "שם מאפיין");
    if (!input.modelId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
    const model = await prisma.zirconiaModel.findUnique({ where: { id: input.modelId } });
    if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    const last = await prisma.zirconiaAttribute.aggregate({
      where: { modelId: input.modelId },
      _max: { sortOrder: true },
    });
    await prisma.zirconiaAttribute.create({
      data: { modelId: input.modelId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return;
  }

  const label = cleanName(input.name, "ערך");
  if (!input.attributeId) throw new AppError("VALIDATION_ERROR", "חסר מאפיין", 400);
  const attribute = await prisma.zirconiaAttribute.findUnique({ where: { id: input.attributeId } });
  if (!attribute) throw new AppError("NOT_FOUND", "המאפיין לא נמצא", 404);
  const last = await prisma.zirconiaAttributeValue.aggregate({
    where: { attributeId: input.attributeId },
    _max: { sortOrder: true },
  });
  await prisma.zirconiaAttributeValue.create({
    data: { attributeId: input.attributeId, label, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
}

export async function renameZirconiaNode(input: {
  kind: ZirconiaCatalogKind;
  id: string;
  name?: string;
}): Promise<void> {
  if (input.kind === "model") {
    const name = cleanName(input.name, "שם דגם");
    const updated = await prisma.zirconiaModel.updateMany({ where: { id: input.id }, data: { name } });
    if (updated.count === 0) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
    return;
  }
  if (input.kind === "attribute") {
    const name = cleanName(input.name, "שם מאפיין");
    const updated = await prisma.zirconiaAttribute.updateMany({ where: { id: input.id }, data: { name } });
    if (updated.count === 0) throw new AppError("NOT_FOUND", "המאפיין לא נמצא", 404);
    return;
  }
  const label = cleanName(input.name, "ערך");
  const updated = await prisma.zirconiaAttributeValue.updateMany({
    where: { id: input.id },
    data: { label },
  });
  if (updated.count === 0) throw new AppError("NOT_FOUND", "הערך לא נמצא", 404);
}

export async function reorderZirconiaNodes(input: {
  kind: ZirconiaCatalogKind;
  orderedIds: string[];
  modelId?: string;
  attributeId?: string;
}): Promise<void> {
  if (input.kind === "model") {
    const existing = await prisma.zirconiaModel.findMany({ select: { id: true } });
    assertSameSet(
      existing.map((row) => row.id),
      input.orderedIds,
      "סדר הדגמים אינו תקין",
    );
    await prisma.$transaction(
      input.orderedIds.map((id, sortOrder) =>
        prisma.zirconiaModel.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return;
  }

  if (input.kind === "attribute") {
    if (!input.modelId) throw new AppError("VALIDATION_ERROR", "חסר דגם", 400);
    const existing = await prisma.zirconiaAttribute.findMany({
      where: { modelId: input.modelId },
      select: { id: true },
    });
    assertSameSet(
      existing.map((row) => row.id),
      input.orderedIds,
      "סדר המאפיינים אינו תקין",
    );
    await prisma.$transaction(
      input.orderedIds.map((id, sortOrder) =>
        prisma.zirconiaAttribute.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return;
  }

  if (!input.attributeId) throw new AppError("VALIDATION_ERROR", "חסר מאפיין", 400);
  const existing = await prisma.zirconiaAttributeValue.findMany({
    where: { attributeId: input.attributeId },
    select: { id: true },
  });
  assertSameSet(
    existing.map((row) => row.id),
    input.orderedIds,
    "סדר הערכים אינו תקין",
  );
  await prisma.$transaction(
    input.orderedIds.map((id, sortOrder) =>
      prisma.zirconiaAttributeValue.update({ where: { id }, data: { sortOrder } }),
    ),
  );
}

export async function deleteZirconiaNode(kind: ZirconiaCatalogKind, id: string): Promise<void> {
  if (kind === "value") {
    const value = await prisma.zirconiaAttributeValue.findUnique({ where: { id } });
    if (!value) throw new AppError("NOT_FOUND", "הערך לא נמצא", 404);
    await prisma.zirconiaAttributeValue.delete({ where: { id } });
    return;
  }

  if (kind === "attribute") {
    const attribute = await prisma.zirconiaAttribute.findUnique({
      where: { id },
      include: { _count: { select: { values: true } } },
    });
    if (!attribute) throw new AppError("NOT_FOUND", "המאפיין לא נמצא", 404);
    if (attribute._count.values > 0) {
      throw new AppError(
        "CONFLICT",
        "לא ניתן למחוק מאפיין כל עוד קיימים ערכים מקושרים. מחקו את הערכים תחילה.",
        409,
      );
    }
    await prisma.zirconiaAttribute.delete({ where: { id } });
    return;
  }

  const model = await prisma.zirconiaModel.findUnique({
    where: { id },
    include: { attributes: { include: { _count: { select: { values: true } } } } },
  });
  if (!model) throw new AppError("NOT_FOUND", "הדגם לא נמצא", 404);
  const linkedValues = model.attributes.reduce((sum, attribute) => sum + attribute._count.values, 0);
  if (linkedValues > 0) {
    throw new AppError(
      "CONFLICT",
      "לא ניתן למחוק דגם כל עוד קיימים ערכים מקושרים. מחקו את הערכים תחילה.",
      409,
    );
  }
  await prisma.zirconiaModel.delete({ where: { id } });
}
