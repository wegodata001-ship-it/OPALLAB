import { randomBytes } from "node:crypto";
import type { SimpleStockKind } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { STORAGE_BUCKETS } from "@/lib/supabase/admin";
import { buildInventoryImagePath, deleteFile, getSignedUrl, uploadFile } from "@/lib/supabase/storage";
import { isMediaKind, isMediaLeaf, isMediaModule, type MediaModule } from "@/lib/inventory/inventory-media-shared";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 6_000_000;
const MAX_IMAGES = 8;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type MediaImage = { id: string; url: string | null; isPrimary: boolean };
export type MediaRecord = { entityId: string; entityKind: string; barcode: string; images: MediaImage[] };

function asModule(value: string): MediaModule {
  if (!isMediaModule(value)) throw new AppError("VALIDATION_ERROR", "סוג מלאי לא תקין", 400);
  return value;
}

function normalizeCode(value: string) {
  const code = value.trim();
  if (!code || code.length > 64) throw new AppError("VALIDATION_ERROR", "ברקוד לא תקין", 400);
  if (/[\u0000-\u001f]/.test(code)) throw new AppError("VALIDATION_ERROR", "ברקוד לא תקין", 400);
  return code;
}

function makeCode() {
  const bytes = randomBytes(8);
  let body = "";
  for (const byte of bytes) body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `OP${body}`;
}

function isUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}

async function assertEntity(module: MediaModule, kind: string, entityId: string) {
  if (!isMediaKind(module, kind) || !entityId) throw new AppError("VALIDATION_ERROR", "סוג פריט לא תקין", 400);
  const found = await findEntity(module, kind, entityId);
  if (!found) throw new AppError("NOT_FOUND", "הפריט לא נמצא", 404);
}

async function findEntity(module: MediaModule, kind: string, id: string) {
  if (module === "ZIRCONIA" && kind === "model") return prisma.zirconiaModel.findUnique({ where: { id }, select: { id: true } });
  if (module === "ZIRCONIA" && kind === "variant") return prisma.zirconiaVariant.findUnique({ where: { id }, select: { id: true } });
  if (module === "ZIRCONIA" && kind === "color") return prisma.zirconiaColor.findUnique({ where: { id }, select: { id: true } });
  if (module === "ZIRCONIA" && kind === "height") return prisma.zirconiaHeight.findUnique({ where: { id }, select: { id: true } });
  if (module === "TITANIUM" && kind === "category") return prisma.titaniumCategory.findUnique({ where: { id }, select: { id: true } });
  if (module === "TITANIUM" && kind === "model") return prisma.titaniumModel.findUnique({ where: { id }, select: { id: true } });
  if (module === "TITANIUM" && kind === "radius") return prisma.titaniumRadius.findUnique({ where: { id }, select: { id: true } });
  if (module === "TITANIUM" && kind === "size") return prisma.titaniumSize.findUnique({ where: { id }, select: { id: true } });
  if (module === "BMMA" && kind === "category") return prisma.bmmaCategory.findUnique({ where: { id }, select: { id: true } });
  if (module === "BMMA" && kind === "model") return prisma.bmmaModel.findUnique({ where: { id }, select: { id: true } });
  if (module === "BMMA" && kind === "color") return prisma.bmmaColor.findUnique({ where: { id }, select: { id: true } });
  if (module === "BMMA" && kind === "height") return prisma.bmmaHeight.findUnique({ where: { id }, select: { id: true } });
  if (module === "DRILLS" && kind === "catalog" && id === "drills-catalog") return { id };
  if (module === "DRILLS" && kind === "machine") return prisma.drillMachine.findUnique({ where: { id }, select: { id: true } });
  if (module === "DRILLS" && kind === "type") return prisma.drillType.findUnique({ where: { id }, select: { id: true } });
  if (module === "DRILLS" && kind === "bit") return prisma.drillBit.findUnique({ where: { id }, select: { id: true } });
  if (module === "IMPLANTS" && kind === "brand") return prisma.implantBrand.findUnique({ where: { id }, select: { id: true } });
  if (module === "IMPLANTS" && kind === "model") return prisma.implantModel.findUnique({ where: { id }, select: { id: true } });
  if (module === "IMPLANTS" && kind === "type") return prisma.implantType.findUnique({ where: { id }, select: { id: true } });
  if (module === "IMPLANTS" && kind === "height") return prisma.implantHeight.findUnique({ where: { id }, select: { id: true } });
  if ((module === "CLINIC_MATERIALS" || module === "OTHER_MATERIALS") && kind === "item") {
    return prisma.simpleStockItem.findFirst({ where: { id, kind: module as SimpleStockKind }, select: { id: true } });
  }
  if (module === "DOCTOR_PARTS" && kind === "part") return prisma.doctorPart.findUnique({ where: { id }, select: { id: true } });
  return null;
}

async function assertCodeFree(code: string, entityId: string) {
  const [scan, classic] = await Promise.all([
    prisma.inventoryScanCode.findUnique({ where: { code }, select: { entityId: true } }),
    prisma.inventoryItem.findFirst({ where: { barcode: code }, select: { id: true } }),
  ]);
  if (classic || (scan && scan.entityId !== entityId)) throw new AppError("CONFLICT", "הברקוד כבר משויך לפריט אחר", 409);
}

export async function listInventoryMedia(moduleRaw: string): Promise<MediaRecord[]> {
  const module = asModule(moduleRaw);
  const [images, codes] = await Promise.all([
    prisma.inventoryImage.findMany({
      where: { module },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.inventoryScanCode.findMany({ where: { module } }),
  ]);
  const grouped = new Map<string, MediaRecord>();
  for (const image of images) {
    const current = grouped.get(image.entityId) ?? { entityId: image.entityId, entityKind: image.entityKind, barcode: "", images: [] };
    const url = await getSignedUrl(STORAGE_BUCKETS.INVENTORY_IMAGES, image.storagePath);
    current.images.push({ id: image.id, url, isPrimary: image.isPrimary });
    grouped.set(image.entityId, current);
  }
  for (const code of codes) {
    const current = grouped.get(code.entityId) ?? { entityId: code.entityId, entityKind: code.entityKind, barcode: "", images: [] };
    current.barcode = code.code;
    current.entityKind = code.entityKind;
    grouped.set(code.entityId, current);
  }
  return [...grouped.values()];
}

export async function lookupInventoryBarcode(raw: string) {
  const code = normalizeCode(raw);
  const scan = await prisma.inventoryScanCode.findUnique({ where: { code } });
  if (scan) return { module: scan.module, entityKind: scan.entityKind, entityId: scan.entityId, code: scan.code };
  const classic = await prisma.inventoryItem.findFirst({ where: { barcode: code }, select: { id: true, name: true } });
  if (!classic) return null;
  return { module: "CLASSIC", entityKind: "item", entityId: classic.id, code, name: classic.name };
}

export async function uploadInventoryImage(input: {
  module: string;
  entityKind: string;
  entityId: string;
  userId: string;
  bytes: Buffer;
  mimeType: string;
  makePrimary?: boolean;
}) {
  const module = asModule(input.module);
  await assertEntity(module, input.entityKind, input.entityId);
  if (!IMAGE_TYPES.has(input.mimeType)) throw new AppError("VALIDATION_ERROR", "אפשר להעלות JPG, PNG או WEBP", 400);
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_BYTES) throw new AppError("VALIDATION_ERROR", "גודל התמונה גדול מדי", 400);
  const existing = await prisma.inventoryImage.findMany({
    where: { module, entityKind: input.entityKind, entityId: input.entityId },
    orderBy: { sortOrder: "asc" },
  });
  if (existing.length >= MAX_IMAGES) throw new AppError("VALIDATION_ERROR", "אפשר לשמור עד 8 תמונות לפריט", 400);
  const primary = input.makePrimary || existing.length === 0;
  const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
  const imageId = `img_${randomBytes(8).toString("hex")}`;
  const storagePath = buildInventoryImagePath(input.entityId, `${imageId}.${extension}`);
  await uploadFile(STORAGE_BUCKETS.INVENTORY_IMAGES, storagePath, input.bytes, input.mimeType);
  try {
    if (primary) {
      await prisma.inventoryImage.updateMany({
        where: { module, entityKind: input.entityKind, entityId: input.entityId, isPrimary: true },
        data: { isPrimary: false, updatedById: input.userId },
      });
    }
    const created = await prisma.inventoryImage.create({
      data: {
        module,
        entityKind: input.entityKind,
        entityId: input.entityId,
        storagePath,
        isPrimary: primary,
        sortOrder: existing.length,
        createdById: input.userId,
        updatedById: input.userId,
      },
    });
    await writeAuditLog({
      userId: input.userId,
      action: "INVENTORY_MEDIA",
      entityType: "InventoryImage",
      entityId: created.id,
      details: { module, entityKind: input.entityKind, entityId: input.entityId, op: "upload" },
    });
    return created.id;
  } catch (error) {
    await deleteFile(STORAGE_BUCKETS.INVENTORY_IMAGES, storagePath).catch(() => undefined);
    throw error;
  }
}

export async function deleteInventoryImage(imageId: string, userId: string) {
  const image = await prisma.inventoryImage.findUnique({ where: { id: imageId } });
  if (!image) throw new AppError("NOT_FOUND", "התמונה לא נמצאה", 404);
  await prisma.inventoryImage.delete({ where: { id: image.id } });
  await deleteFile(STORAGE_BUCKETS.INVENTORY_IMAGES, image.storagePath).catch(() => undefined);
  if (image.isPrimary) {
    const next = await prisma.inventoryImage.findFirst({
      where: { module: image.module, entityKind: image.entityKind, entityId: image.entityId },
      orderBy: { sortOrder: "asc" },
    });
    if (next) await prisma.inventoryImage.update({ where: { id: next.id }, data: { isPrimary: true, updatedById: userId } });
  }
  await writeAuditLog({
    userId,
    action: "INVENTORY_MEDIA",
    entityType: "InventoryImage",
    entityId: image.id,
    details: { module: image.module, entityKind: image.entityKind, entityId: image.entityId, op: "delete" },
  });
}

export async function setPrimaryInventoryImage(imageId: string, userId: string) {
  const image = await prisma.inventoryImage.findUnique({ where: { id: imageId } });
  if (!image) throw new AppError("NOT_FOUND", "התמונה לא נמצאה", 404);
  await prisma.$transaction([
    prisma.inventoryImage.updateMany({
      where: { module: image.module, entityKind: image.entityKind, entityId: image.entityId, isPrimary: true },
      data: { isPrimary: false, updatedById: userId },
    }),
    prisma.inventoryImage.update({ where: { id: image.id }, data: { isPrimary: true, updatedById: userId } }),
  ]);
}

async function saveCode(module: MediaModule, entityKind: string, entityId: string, code: string, userId: string) {
  await assertEntity(module, entityKind, entityId);
  if (!isMediaLeaf(module, entityKind)) throw new AppError("VALIDATION_ERROR", "ברקוד נשמר לפריט מלאי בלבד", 400);
  await assertCodeFree(code, entityId);
  try {
    await prisma.inventoryScanCode.upsert({
      where: { module_entityKind_entityId: { module, entityKind, entityId } },
      create: { code, module, entityKind, entityId, createdById: userId, updatedById: userId },
      update: { code, updatedById: userId },
    });
  } catch (error) {
    if (isUniqueError(error)) throw new AppError("CONFLICT", "הברקוד כבר משויך לפריט אחר", 409);
    throw error;
  }
  await writeAuditLog({
    userId,
    action: "INVENTORY_MEDIA",
    entityType: "InventoryScanCode",
    entityId,
    details: { module, entityKind, op: "barcode" },
  });
  return code;
}

export async function setInventoryBarcode(input: { module: string; entityKind: string; entityId: string; code: string; userId: string }) {
  return saveCode(asModule(input.module), input.entityKind, input.entityId, normalizeCode(input.code), input.userId);
}

export async function generateInventoryBarcode(input: { module: string; entityKind: string; entityId: string; userId: string }) {
  const module = asModule(input.module);
  let last: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await saveCode(module, input.entityKind, input.entityId, makeCode(), input.userId);
    } catch (error) {
      last = error;
      if (!(error instanceof AppError) || error.status !== 409) throw error;
    }
  }
  throw last instanceof Error ? last : new AppError("CONFLICT", "לא הצלחנו ליצור ברקוד ייחודי", 409);
}

export async function clearInventoryBarcode(input: { module: string; entityKind: string; entityId: string; userId: string }) {
  const module = asModule(input.module);
  await assertEntity(module, input.entityKind, input.entityId);
  await prisma.inventoryScanCode.deleteMany({ where: { module, entityKind: input.entityKind, entityId: input.entityId } });
}

