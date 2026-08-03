import bcrypt from "bcryptjs";
import type {
  AttendanceRecord as PrismaAttendance,
  Courier as PrismaCourier,
  Doctor as PrismaDoctor,
  InventoryCategory as PrismaInventoryCategory,
  InventoryItem as PrismaInventoryItem,
  InventoryMovement as PrismaInventoryMovement,
  Order as PrismaOrder,
  OrderFile as PrismaOrderFile,
  OrderStatusHistory as PrismaOrderStatusHistory,
  Payment as PrismaPayment,
  Patient as PrismaPatient,
  Shipment as PrismaShipment,
  User as PrismaUser,
} from "@prisma/client";
import type {
  AttendanceRecord,
  Courier,
  Doctor,
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  LabSettings,
  Order,
  OrderFile,
  OrderStatus,
  OrderStatusHistory,
  OrderWithRelations,
  Payment,
  Patient,
  Shipment,
  StageCompletion,
  User,
} from "@/lib/types";
import { getSignedUrl, STORAGE_BUCKETS } from "@/lib/supabase/storage";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function mapUser(user: PrismaUser): User {
  const roles = user.roles?.length ? user.roles : [user.role];
  return {
    id: user.id,
    username: user.username,
    password: "",
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    roles,
    authUserId: user.authUserId,
    nfcTagId: user.nfcTagId,
    address: user.address,
    salary: user.salary,
    salaryType: user.salaryType,
    hourlyRate: user.hourlyRate,
    color: user.color,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function mapDoctor(doctor: PrismaDoctor): Doctor {
  return { ...doctor };
}

export function mapPatient(patient: PrismaPatient): Patient {
  return { ...patient };
}

export function mapCourier(courier: PrismaCourier): Courier {
  return { ...courier };
}

export function mapPayment(payment: PrismaPayment): Payment {
  return { ...payment };
}

export function mapShipment(shipment: PrismaShipment): Shipment {
  return { ...shipment };
}

export function mapStatusHistory(history: PrismaOrderStatusHistory): OrderStatusHistory {
  return { ...history };
}

export function mapAttendance(record: PrismaAttendance): AttendanceRecord {
  return { ...record };
}

export function mapInventoryCategory(category: PrismaInventoryCategory): InventoryCategory {
  return { ...category };
}

export function mapInventoryMovement(movement: PrismaInventoryMovement): InventoryMovement {
  return { ...movement };
}

export function parseCompletedStages(value: unknown): Order["completedStages"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Order["completedStages"] = {};
  for (const [key, stage] of Object.entries(value as Record<string, unknown>)) {
    if (!stage || typeof stage !== "object") continue;
    const s = stage as Record<string, unknown>;
    if (typeof s.completedBy !== "string") continue;
    const completedAt =
      s.completedAt instanceof Date
        ? s.completedAt
        : typeof s.completedAt === "string"
          ? new Date(s.completedAt)
          : null;
    if (!completedAt || Number.isNaN(completedAt.getTime())) continue;
    result[key as OrderStatus] = { completedBy: s.completedBy, completedAt };
  }
  return result;
}

export function serializeCompletedStages(stages: Order["completedStages"]): Record<string, { completedBy: string; completedAt: string }> {
  const result: Record<string, { completedBy: string; completedAt: string }> = {};
  for (const [key, value] of Object.entries(stages)) {
    if (value) {
      result[key] = {
        completedBy: value.completedBy,
        completedAt: value.completedAt.toISOString(),
      };
    }
  }
  return result;
}

export function mapOrder(order: PrismaOrder): Order {
  return {
    ...order,
    completedStages: parseCompletedStages(order.completedStages),
  };
}

export async function mapOrderFile(
  file: PrismaOrderFile,
  uploaderName?: string | null,
): Promise<OrderFile> {
  const dataUrl = file.storagePath
    ? await getSignedUrl(STORAGE_BUCKETS.ORDER_FILES, file.storagePath)
    : null;

  return {
    id: file.id,
    orderId: file.orderId,
    fileName: file.fileName,
    fileType: file.fileType,
    fileSize: file.fileSize,
    uploadedBy: file.uploadedBy,
    uploadedAt: file.uploadedAt,
    notes: file.notes,
    mimeType: file.mimeType,
    storagePath: file.storagePath,
    dataUrl,
    category: file.category,
    slotKey: file.slotKey,
    versionKey: file.versionKey,
    version: file.version,
    isCurrent: file.isCurrent,
    replacesId: file.replacesId,
    uploadedByName: uploaderName ?? null,
  };
}

export async function mapInventoryItem(item: PrismaInventoryItem): Promise<InventoryItem> {
  const path = item.storagePath ?? item.imageUrl;
  const imageUrl =
    path && !path.startsWith("http")
      ? (await getSignedUrl(STORAGE_BUCKETS.INVENTORY_IMAGES, path)) ?? path
      : item.imageUrl;

  return {
    ...item,
    imageUrl,
  };
}

type OrderWithIncludes = PrismaOrder & {
  doctor: PrismaDoctor;
  patient: PrismaPatient;
  assignedDesigner: PrismaUser | null;
  processingEmployee: PrismaUser | null;
  finishEmployee: PrismaUser | null;
  files: PrismaOrderFile[];
  statusHistory: PrismaOrderStatusHistory[];
  shipment: PrismaShipment | null;
};

export async function mapOrderWithRelations(order: OrderWithIncludes): Promise<OrderWithRelations> {
  const files = await Promise.all(order.files.map((file) => mapOrderFile(file)));
  return {
    ...mapOrder(order),
    doctor: mapDoctor(order.doctor),
    patient: mapPatient(order.patient),
    assignedDesigner: order.assignedDesigner ? mapUser(order.assignedDesigner) : null,
    processingEmployee: order.processingEmployee ? mapUser(order.processingEmployee) : null,
    finishEmployee: order.finishEmployee ? mapUser(order.finishEmployee) : null,
    files,
    statusHistory: order.statusHistory.map(mapStatusHistory),
    shipment: order.shipment ? mapShipment(order.shipment) : null,
  };
}

export function mapLabSettings(_entries: { key: string; value: string }[]): LabSettings {
  return {};
}

export function labSettingsToEntries(_settings: LabSettings): { key: string; value: string }[] {
  return [];
}

export const ORDER_INCLUDE = {
  doctor: true,
  patient: true,
  assignedDesigner: true,
  processingEmployee: true,
  finishEmployee: true,
  files: { orderBy: { uploadedAt: "desc" as const } },
  statusHistory: { orderBy: { createdAt: "desc" as const } },
  shipment: true,
} as const;
