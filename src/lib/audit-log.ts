import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type AuditAction =
  | "USER_UPDATE"
  | "USER_CREATE"
  | "PASSWORD_CHANGE"
  | "EMAIL_CHANGE"
  | "ROLE_CHANGE"
  | "ROLE_ADD"
  | "DOCTOR_UPDATE"
  | "DOCTOR_CREATE"
  | "COURIER_UPDATE"
  | "INVENTORY_EDIT"
  | "INVENTORY_DELETE"
  | "INVENTORY_TRANSFER_CATEGORY"
  | "INVENTORY_TRANSFER_WAREHOUSE"
  | "INVENTORY_STOCK_IN"
  | "INVENTORY_STOCK_OUT"
  | "SHIPMENT_CREATE"
  | "SHIPMENT_SIGNATURE_ADD"
  | "SHIPMENT_SIGNATURE_REPLACE"
  | "SHIPMENT_SIGNATURE_DELETE"
  | "SHIPMENT_SIGNATURE_VIEW"
  | "SHIPMENT_LOCK"
  | "ORDER_SOFT_DELETE"
  | "ORDER_RESTORE"
  | "ORDER_PERMANENT_DELETE"
  | "FORBIDDEN_ATTEMPT";

export async function writeAuditLog(input: {
  userId: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function getAuditLogsForEntity(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, username: true } } },
  });
}
