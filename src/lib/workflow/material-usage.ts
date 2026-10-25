import type { ProductionMaterialStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { writeAuditLog } from "@/lib/audit-log";
import type { User } from "@/lib/types";
import { getSignedUrl } from "@/lib/supabase/storage";
import { STORAGE_BUCKETS } from "@/lib/supabase/admin";
import {
  canEditProductionMaterial,
  canRecordProductionMaterial,
  isMaterialStage,
  MATERIAL_STAGE_LABELS,
  USAGE_NOTE,
  type MaterialOption,
  type MaterialRevisionView,
  type MaterialStage,
  type MaterialUseView,
} from "@/lib/workflow/material-usage-shared";

export {
  canCorrectAnyProductionMaterial,
  canEditProductionMaterial,
  canRecordProductionMaterial,
  canViewMaterialUsageReport,
  isMaterialStage,
  MATERIAL_STAGE_LABELS,
  MATERIAL_STAGES,
  USAGE_NOTE,
} from "@/lib/workflow/material-usage-shared";
export type { MaterialOption, MaterialRevisionView, MaterialStage, MaterialUseView } from "@/lib/workflow/material-usage-shared";

type Actor = Pick<User, "id" | "role" | "roles">;

function actionLabel(action: string) {
  if (action === "CREATE") return "נוצר";
  if (action === "UPDATE") return "עודכן";
  if (action === "REMOVE") return "הוסר";
  return action;
}

async function signPath(storagePath: string) {
  if (!storagePath) return null;
  try {
    return await getSignedUrl(STORAGE_BUCKETS.INVENTORY_IMAGES, storagePath);
  } catch {
    return null;
  }
}

function modelLabel(modelName: string, variantName: string | null | undefined) {
  return variantName ? `${modelName} / ${variantName}` : modelName;
}

export async function listZirconiaMaterialOptions(): Promise<MaterialOption[]> {
  const heights = await prisma.zirconiaHeight.findMany({
    where: { archivedAt: null, colorId: { not: null }, color: { archivedAt: null } },
    include: { model: true, color: { include: { variant: true } } },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const ids = heights.map((height) => height.id);
  const [images, codes] = ids.length === 0
    ? [[], []]
    : await Promise.all([
      prisma.inventoryImage.findMany({
        where: { module: "ZIRCONIA", entityKind: "height", entityId: { in: ids } },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.inventoryScanCode.findMany({
        where: { module: "ZIRCONIA", entityKind: "height", entityId: { in: ids } },
      }),
    ]);
  const imageByHeight = new Map<string, string>();
  for (const image of images) {
    if (!imageByHeight.has(image.entityId)) imageByHeight.set(image.entityId, image.storagePath);
  }
  const codeByHeight = new Map(codes.map((code) => [code.entityId, code.code]));
  const options: MaterialOption[] = [];
  for (const height of heights) {
    if (!height.color) continue;
    const imagePath = imageByHeight.get(height.id) ?? "";
    options.push({
      heightId: height.id,
      modelKey: `${height.modelId}:${height.color.variantId ?? ""}`,
      modelName: modelLabel(height.model.name, height.color.variant?.name),
      colorId: height.color.id,
      colorName: height.color.name,
      heightLabel: height.label,
      imagePath,
      imageUrl: await signPath(imagePath),
      barcode: codeByHeight.get(height.id) ?? "",
    });
  }
  options.sort((a, b) => a.modelName.localeCompare(b.modelName, "he") || a.colorName.localeCompare(b.colorName, "he") || a.heightLabel.localeCompare(b.heightLabel, "he"));
  return options;
}

async function snapshotHeight(heightId: string) {
  const height = await prisma.zirconiaHeight.findFirst({
    where: { id: heightId, archivedAt: null, colorId: { not: null }, color: { archivedAt: null } },
    include: { model: true, color: { include: { variant: true } } },
  });
  if (!height?.color) throw new AppError("NOT_FOUND", "מוצר הזירקוניה לא נמצא במלאי", 404);
  const [image, code] = await Promise.all([
    prisma.inventoryImage.findFirst({
      where: { module: "ZIRCONIA", entityKind: "height", entityId: height.id },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    }),
    prisma.inventoryScanCode.findFirst({ where: { module: "ZIRCONIA", entityKind: "height", entityId: height.id } }),
  ]);
  return {
    heightId: height.id,
    modelName: modelLabel(height.model.name, height.color.variant?.name),
    colorName: height.color.name,
    heightLabel: height.label,
    imagePath: image?.storagePath ?? "",
    barcode: code?.code ?? "",
  };
}

function assertStage(stage: string): MaterialStage {
  if (!isMaterialStage(stage)) throw new AppError("VALIDATION_ERROR", "ניתן לתעד חומר רק בעיצוב או בהדפסה 3D", 400);
  return stage;
}

async function loadOrder(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { id: true, serialNumber: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "ההזמנה לא נמצאה", 404);
  return order;
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}

async function toView(
  row: {
    id: string;
    orderId: string;
    orderSerial: string;
    stage: ProductionMaterialStage;
    heightId: string;
    modelName: string;
    colorName: string;
    heightLabel: string;
    imagePath: string;
    barcode: string;
    notes: string;
    recordedById: string;
    recordedAt: Date;
    recordedBy: { name: string };
  },
  user: Actor,
): Promise<MaterialUseView> {
  const stage = row.stage as MaterialStage;
  return {
    id: row.id,
    orderId: row.orderId,
    orderSerial: row.orderSerial,
    stage,
    stageLabel: MATERIAL_STAGE_LABELS[stage],
    heightId: row.heightId,
    modelName: row.modelName,
    colorName: row.colorName,
    heightLabel: row.heightLabel,
    imagePath: row.imagePath,
    imageUrl: await signPath(row.imagePath),
    barcode: row.barcode,
    notes: row.notes,
    recordedById: row.recordedById,
    recordedByName: row.recordedBy.name,
    recordedAt: row.recordedAt.toISOString(),
    canEdit: canEditProductionMaterial(user, { recordedById: row.recordedById, stage }),
  };
}

const useInclude = { recordedBy: { select: { name: true } } } as const;

export async function listProductionMaterialUses(user: Actor, orderId?: string) {
  const rows = await prisma.productionMaterialUse.findMany({
    where: { removedAt: null, ...(orderId ? { orderId } : {}) },
    include: useInclude,
    orderBy: { recordedAt: "asc" },
  });
  return Promise.all(rows.map((row) => toView(row, user)));
}

export async function listProductionMaterialHistory(useId: string): Promise<MaterialRevisionView[]> {
  const revisions = await prisma.productionMaterialUseRevision.findMany({
    where: { useId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return revisions.map((revision) => ({
    id: revision.id,
    action: revision.action,
    actionLabel: actionLabel(revision.action),
    modelName: revision.modelName,
    colorName: revision.colorName,
    heightLabel: revision.heightLabel,
    notes: revision.notes,
    userName: revision.user.name,
    createdAt: revision.createdAt.toISOString(),
  }));
}

export async function recordProductionMaterial(user: Actor, input: { orderId: string; stage: string; heightId: string; notes?: string }) {
  const stage = assertStage(input.stage);
  if (!canRecordProductionMaterial(user, stage)) throw new AppError("FORBIDDEN", "אין הרשאה לתעד חומר בשלב זה", 403);
  const notes = (input.notes ?? "").trim();
  const order = await loadOrder(input.orderId);
  const snap = await snapshotHeight(input.heightId);
  const existing = await prisma.productionMaterialUse.findFirst({
    where: { orderId: order.id, stage, heightId: snap.heightId, removedAt: null },
    include: useInclude,
  });
  if (existing) {
    if (existing.notes === notes) return { use: await toView(existing, user), created: false };
    const updated = await prisma.productionMaterialUse.update({
      where: { id: existing.id },
      data: { notes },
      include: useInclude,
    });
    await prisma.productionMaterialUseRevision.create({
      data: { useId: existing.id, action: "UPDATE", modelName: existing.modelName, colorName: existing.colorName, heightLabel: existing.heightLabel, notes, userId: user.id },
    });
    return { use: await toView(updated, user), created: false };
  }
  try {
    const created = await prisma.productionMaterialUse.create({
      data: {
        orderId: order.id,
        orderSerial: order.serialNumber,
        stage,
        heightId: snap.heightId,
        modelName: snap.modelName,
        colorName: snap.colorName,
        heightLabel: snap.heightLabel,
        imagePath: snap.imagePath,
        barcode: snap.barcode,
        notes,
        recordedById: user.id,
      },
      include: useInclude,
    });
    await prisma.productionMaterialUseRevision.create({
      data: { useId: created.id, action: "CREATE", modelName: snap.modelName, colorName: snap.colorName, heightLabel: snap.heightLabel, notes, userId: user.id },
    });
    await writeAuditLog({
      userId: user.id,
      action: "PRODUCTION_MATERIAL_USE",
      entityType: "ProductionMaterialUse",
      entityId: created.id,
      details: { orderId: order.id, stage, heightId: snap.heightId },
    });
    return { use: await toView(created, user), created: true };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const raced = await prisma.productionMaterialUse.findFirst({
      where: { orderId: order.id, stage, heightId: snap.heightId, removedAt: null },
      include: useInclude,
    });
    if (!raced) throw error;
    return { use: await toView(raced, user), created: false };
  }
}

export async function updateProductionMaterial(user: Actor, input: { id: string; heightId?: string; notes?: string }) {
  const current = await prisma.productionMaterialUse.findFirst({ where: { id: input.id, removedAt: null }, include: useInclude });
  if (!current) throw new AppError("NOT_FOUND", "התיעוד לא נמצא", 404);
  const stage = current.stage as MaterialStage;
  if (!canEditProductionMaterial(user, { recordedById: current.recordedById, stage })) {
    throw new AppError("FORBIDDEN", "אין הרשאה לתקן תיעוד זה", 403);
  }
  const notes = input.notes === undefined ? current.notes : input.notes.trim();
  const snap = input.heightId && input.heightId !== current.heightId ? await snapshotHeight(input.heightId) : null;
  if (snap) {
    const clash = await prisma.productionMaterialUse.findFirst({
      where: { orderId: current.orderId, stage: current.stage, heightId: snap.heightId, removedAt: null, NOT: { id: current.id } },
    });
    if (clash) throw new AppError("CONFLICT", "החומר הזה כבר מתועד בשלב זה", 409);
  }
  const next = {
    heightId: snap?.heightId ?? current.heightId,
    modelName: snap?.modelName ?? current.modelName,
    colorName: snap?.colorName ?? current.colorName,
    heightLabel: snap?.heightLabel ?? current.heightLabel,
    imagePath: snap?.imagePath ?? current.imagePath,
    barcode: snap?.barcode ?? current.barcode,
    notes,
  };
  if (
    next.heightId === current.heightId &&
    next.notes === current.notes &&
    next.modelName === current.modelName &&
    next.colorName === current.colorName &&
    next.heightLabel === current.heightLabel
  ) {
    return { use: await toView(current, user), changed: false };
  }
  const updated = await prisma.productionMaterialUse.update({ where: { id: current.id }, data: next, include: useInclude });
  await prisma.productionMaterialUseRevision.create({
    data: { useId: current.id, action: "UPDATE", modelName: next.modelName, colorName: next.colorName, heightLabel: next.heightLabel, notes, userId: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: "PRODUCTION_MATERIAL_USE_UPDATE",
    entityType: "ProductionMaterialUse",
    entityId: current.id,
    details: { heightId: next.heightId },
  });
  return { use: await toView(updated, user), changed: true };
}

export async function removeProductionMaterial(user: Actor, id: string) {
  const current = await prisma.productionMaterialUse.findFirst({ where: { id, removedAt: null } });
  if (!current) throw new AppError("NOT_FOUND", "התיעוד לא נמצא", 404);
  const stage = current.stage as MaterialStage;
  if (!canEditProductionMaterial(user, { recordedById: current.recordedById, stage })) {
    throw new AppError("FORBIDDEN", "אין הרשאה להסיר תיעוד זה", 403);
  }
  await prisma.productionMaterialUse.update({ where: { id: current.id }, data: { removedAt: new Date() } });
  await prisma.productionMaterialUseRevision.create({
    data: { useId: current.id, action: "REMOVE", modelName: current.modelName, colorName: current.colorName, heightLabel: current.heightLabel, notes: current.notes, userId: user.id },
  });
  await writeAuditLog({
    userId: user.id,
    action: "PRODUCTION_MATERIAL_USE_REMOVE",
    entityType: "ProductionMaterialUse",
    entityId: current.id,
    details: { orderId: current.orderId, stage: current.stage },
  });
}

export type MaterialReportFilters = {
  from?: Date;
  to?: Date;
  orderSerial?: string;
  doctor?: string;
  employeeId?: string;
  stage?: MaterialStage | "";
  model?: string;
  color?: string;
  height?: string;
};

export type MaterialReportRow = {
  id: string;
  recordedAt: Date;
  orderId: string;
  orderSerial: string;
  doctorName: string;
  stage: MaterialStage;
  stageLabel: string;
  modelName: string;
  colorName: string;
  heightLabel: string;
  employeeId: string;
  employeeName: string;
  notes: string;
  barcode: string;
};

export function summarizeMaterialUses(rows: Pick<MaterialReportRow, "orderId" | "modelName" | "colorName" | "heightLabel" | "employeeName" | "stageLabel">[]) {
  const countBy = (key: (row: (typeof rows)[number]) => string) => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(key(row), (map.get(key(row)) ?? 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "he"));
  };
  const ordersByModel = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = ordersByModel.get(row.modelName) ?? new Set<string>();
    set.add(row.orderId);
    ordersByModel.set(row.modelName, set);
  }
  return {
    orderCount: new Set(rows.map((row) => row.orderId)).size,
    recordCount: rows.length,
    ordersByModel: [...ordersByModel.entries()].map(([name, orders]) => ({ name, count: orders.size })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "he")),
    byColor: countBy((row) => row.colorName),
    byHeight: countBy((row) => row.heightLabel),
    byEmployee: countBy((row) => row.employeeName),
    byStage: countBy((row) => row.stageLabel),
    note: USAGE_NOTE,
  };
}

export async function queryMaterialUsageReport(filters: MaterialReportFilters) {
  const serial = filters.orderSerial?.trim();
  const doctor = filters.doctor?.trim();
  const rows = await prisma.productionMaterialUse.findMany({
    where: {
      removedAt: null,
      ...(filters.from || filters.to ? { recordedAt: { gte: filters.from, lte: filters.to } } : {}),
      ...(serial ? { orderSerial: { contains: serial, mode: "insensitive" } } : {}),
      ...(filters.stage ? { stage: filters.stage } : {}),
      ...(filters.model ? { modelName: filters.model } : {}),
      ...(filters.color ? { colorName: filters.color } : {}),
      ...(filters.height ? { heightLabel: filters.height } : {}),
      ...(filters.employeeId ? { recordedById: filters.employeeId } : {}),
      ...(doctor ? { order: { doctor: { name: { contains: doctor, mode: "insensitive" } } } } : {}),
    },
    include: {
      recordedBy: { select: { id: true, name: true } },
      order: { select: { doctor: { select: { name: true } } } },
    },
    orderBy: { recordedAt: "desc" },
  });
  return rows.map((row): MaterialReportRow => ({
    id: row.id,
    recordedAt: row.recordedAt,
    orderId: row.orderId,
    orderSerial: row.orderSerial,
    doctorName: row.order.doctor?.name ?? "",
    stage: row.stage as MaterialStage,
    stageLabel: MATERIAL_STAGE_LABELS[row.stage as MaterialStage],
    modelName: row.modelName,
    colorName: row.colorName,
    heightLabel: row.heightLabel,
    employeeId: row.recordedBy.id,
    employeeName: row.recordedBy.name,
    notes: row.notes,
    barcode: row.barcode,
  }));
}

export async function materialReportFacets() {
  const rows = await prisma.productionMaterialUse.findMany({
    where: { removedAt: null },
    select: {
      modelName: true,
      colorName: true,
      heightLabel: true,
      recordedBy: { select: { id: true, name: true } },
      order: { select: { doctor: { select: { name: true } } } },
    },
  });
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "he"));
  const employees = new Map<string, string>();
  for (const row of rows) employees.set(row.recordedBy.id, row.recordedBy.name);
  return {
    models: unique(rows.map((row) => row.modelName)),
    colors: unique(rows.map((row) => row.colorName)),
    heights: unique(rows.map((row) => row.heightLabel)),
    doctors: unique(rows.map((row) => row.order.doctor?.name ?? "")),
    employees: [...employees.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "he")),
    note: USAGE_NOTE,
  };
}

