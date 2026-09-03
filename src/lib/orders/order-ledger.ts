import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Statuses that mean production work is financially complete. */
export const ORDER_LEDGER_BILLABLE_STATUSES = new Set([
  "PACKAGING",
  "SHIPPED",
  "DELIVERED",
]);

export function shouldBillOrderOnStatusTransition(
  previousStatus: string,
  nextStatus: string,
): boolean {
  return (
    ORDER_LEDGER_BILLABLE_STATUSES.has(nextStatus) &&
    !ORDER_LEDGER_BILLABLE_STATUSES.has(previousStatus)
  );
}

export function workChargeDescription(serialNumber: string): string {
  return `חיוב עבודה ${serialNumber}`;
}

export async function findOrderWorkCharge(
  tx: Tx,
  orderId: string,
  ledgerChargeId?: string | null,
) {
  if (ledgerChargeId) {
    const byId = await tx.payment.findUnique({ where: { id: ledgerChargeId } });
    if (byId && byId.type === "CHARGE" && byId.orderId === orderId) return byId;
  }
  return tx.payment.findFirst({
    where: {
      orderId,
      type: "CHARGE",
      description: { startsWith: "חיוב עבודה" },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Create at most one work CHARGE for an order when production completes.
 * Idempotent — legacy orders that already have a work CHARGE are linked, not duplicated.
 */
export async function ensureOrderWorkCharge(
  tx: Tx,
  input: {
    orderId: string;
    serialNumber: string;
    doctorId: string | null | undefined;
    totalPrice: number | null | undefined;
    patientName?: string | null;
    ledgerChargeId?: string | null;
    actorId: string;
    completedAt?: Date;
  },
): Promise<{ chargeId: string | null; created: boolean; amount: number | null }> {
  const existing = await findOrderWorkCharge(tx, input.orderId, input.ledgerChargeId);
  if (existing) {
    if (!input.ledgerChargeId || input.ledgerChargeId !== existing.id) {
      await tx.order.update({
        where: { id: input.orderId },
        data: { ledgerChargeId: existing.id },
      });
    }
    return { chargeId: existing.id, created: false, amount: existing.amount };
  }

  const amount = input.totalPrice;
  if (amount == null || !(amount > 0)) {
    return { chargeId: null, created: false, amount: null };
  }
  if (!input.doctorId) {
    return { chargeId: null, created: false, amount: null };
  }

  const now = input.completedAt ?? new Date();
  const charge = await tx.payment.create({
    data: {
      doctorId: input.doctorId,
      orderId: input.orderId,
      serialNumber: input.serialNumber,
      patientName: input.patientName ?? null,
      amount,
      type: "CHARGE",
      status: "PENDING",
      description: workChargeDescription(input.serialNumber),
      createdAt: now,
    },
  });

  await tx.doctor.update({
    where: { id: input.doctorId },
    data: { balance: { decrement: amount }, updatedAt: now },
  });

  await tx.order.update({
    where: { id: input.orderId },
    data: { ledgerChargeId: charge.id },
  });

  return { chargeId: charge.id, created: true, amount };
}

/**
 * After a work CHARGE exists, keep it aligned with Order.totalPrice.
 * Updates the existing CHARGE amount (never creates a second full work charge)
 * and adjusts doctor balance by the delta. Audited separately by caller.
 */
export async function reconcileOrderWorkChargePrice(
  tx: Tx,
  input: {
    orderId: string;
    serialNumber: string;
    doctorId: string | null | undefined;
    newTotalPrice: number | null | undefined;
    ledgerChargeId?: string | null;
  },
): Promise<{
  adjusted: boolean;
  previousAmount: number | null;
  newAmount: number | null;
  chargeId: string | null;
}> {
  const charge = await findOrderWorkCharge(tx, input.orderId, input.ledgerChargeId);
  if (!charge) {
    return { adjusted: false, previousAmount: null, newAmount: null, chargeId: null };
  }

  const newAmount =
    input.newTotalPrice != null && Number.isFinite(input.newTotalPrice)
      ? input.newTotalPrice
      : 0;

  if (Math.abs(charge.amount - newAmount) < 1e-9) {
    return {
      adjusted: false,
      previousAmount: charge.amount,
      newAmount,
      chargeId: charge.id,
    };
  }

  const delta = newAmount - charge.amount;
  const now = new Date();

  await tx.payment.update({
    where: { id: charge.id },
    data: {
      amount: newAmount,
      description: workChargeDescription(input.serialNumber),
    },
  });

  const doctorId = charge.doctorId ?? input.doctorId;
  if (doctorId && delta !== 0) {
    await tx.doctor.update({
      where: { id: doctorId },
      data: { balance: { decrement: delta }, updatedAt: now },
    });
  }

  if (!input.ledgerChargeId || input.ledgerChargeId !== charge.id) {
    await tx.order.update({
      where: { id: input.orderId },
      data: { ledgerChargeId: charge.id },
    });
  }

  return {
    adjusted: true,
    previousAmount: charge.amount,
    newAmount,
    chargeId: charge.id,
  };
}

export async function auditOrderWorkChargeCreated(input: {
  actorId: string;
  orderId: string;
  serialNumber: string;
  doctorId: string | null | undefined;
  finalPrice: number;
  chargeId: string;
  completedAt: Date;
}): Promise<void> {
  const { writeAuditLog } = await import("@/lib/audit-log");
  await writeAuditLog({
    userId: input.actorId,
    action: "ORDER_WORK_CHARGE_CREATE",
    entityType: "Order",
    entityId: input.orderId,
    details: {
      orderId: input.orderId,
      orderNumber: input.serialNumber,
      doctorId: input.doctorId ?? null,
      finalPrice: input.finalPrice,
      completedAt: input.completedAt.toISOString(),
      completedBy: input.actorId,
      ledgerChargeId: input.chargeId,
    },
  });
}

export async function auditOrderWorkChargePriceAdjust(input: {
  actorId: string;
  orderId: string;
  serialNumber: string;
  chargeId: string;
  previousAmount: number;
  newAmount: number;
}): Promise<void> {
  const { writeAuditLog } = await import("@/lib/audit-log");
  await writeAuditLog({
    userId: input.actorId,
    action: "ORDER_WORK_CHARGE_ADJUST",
    entityType: "Order",
    entityId: input.orderId,
    details: {
      orderId: input.orderId,
      orderNumber: input.serialNumber,
      ledgerChargeId: input.chargeId,
      previousAmount: input.previousAmount,
      newAmount: input.newAmount,
      delta: input.newAmount - input.previousAmount,
    },
  });
}
