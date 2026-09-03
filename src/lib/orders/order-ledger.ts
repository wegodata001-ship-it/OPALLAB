import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";

type Tx = Prisma.TransactionClient;

/** Statuses that mean production work is financially complete. */
export const ORDER_LEDGER_BILLABLE_STATUSES = new Set([
  "PACKAGING",
  "SHIPPED",
  "DELIVERED",
]);

export const MISSING_ORDER_PRICE_MESSAGE =
  "לא ניתן לסיים את העבודה — לא הוגדר מחיר להזמנה.";

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

export function priceAdjustmentDescription(input: {
  serialNumber: string;
  previousAmount: number;
  newAmount: number;
  reason: string;
}): string {
  const delta = input.newAmount - input.previousAmount;
  const sign = delta > 0 ? "+" : "";
  return `התאמת מחיר ${input.serialNumber}: ${input.previousAmount} → ${input.newAmount} (${sign}${delta}) — ${input.reason}`;
}

/**
 * NULL ≠ ZERO.
 * - null/undefined → block production-complete (price missing)
 * - 0 + REWORK_FREE → allowed, no CHARGE
 * - 0 without free-rework → allowed (explicit zero), no CHARGE
 * - > 0 → allowed, CHARGE created by ensureOrderWorkCharge
 */
export function assertOrderPriceReadyForBilling(order: {
  totalPrice: number | null | undefined;
  otherWorkKind?: string | null;
}): void {
  if (order.otherWorkKind === "REWORK_FREE") {
    return;
  }
  if (order.totalPrice == null || !Number.isFinite(order.totalPrice)) {
    throw new AppError("VALIDATION_ERROR", MISSING_ORDER_PRICE_MESSAGE, 400);
  }
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

/** Original CHARGE amount + signed ADJUSTMENT rows for the order. */
export async function getOrderWorkChargeNet(
  tx: Tx,
  orderId: string,
  chargeAmount: number,
): Promise<number> {
  const adjustments = await tx.payment.findMany({
    where: { orderId, type: "ADJUSTMENT" },
    select: { amount: true },
  });
  return chargeAmount + adjustments.reduce((sum, row) => sum + row.amount, 0);
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
  // Serialize concurrent "סיום עבודה" / bill transitions for this order (race-safe).
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;

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
  const description = workChargeDescription(input.serialNumber);

  try {
    const charge = await tx.payment.create({
      data: {
        doctorId: input.doctorId,
        orderId: input.orderId,
        serialNumber: input.serialNumber,
        patientName: input.patientName ?? null,
        amount,
        type: "CHARGE",
        status: "PENDING",
        description,
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
  } catch (error) {
    // Concurrent insert won — re-link existing work CHARGE (no second balance hit).
    const raced = await findOrderWorkCharge(tx, input.orderId, null);
    if (raced) {
      await tx.order.update({
        where: { id: input.orderId },
        data: { ledgerChargeId: raced.id },
      });
      return { chargeId: raced.id, created: false, amount: raced.amount };
    }
    throw error;
  }
}

/**
 * Align ledger with a new Order.totalPrice after a work CHARGE exists.
 * Keeps the original CHARGE row intact and appends a signed ADJUSTMENT
 * (never a second full work CHARGE). Balance moves by the delta only.
 */
export async function reconcileOrderWorkChargePrice(
  tx: Tx,
  input: {
    orderId: string;
    serialNumber: string;
    doctorId: string | null | undefined;
    newTotalPrice: number | null | undefined;
    ledgerChargeId?: string | null;
    reason?: string | null;
    patientName?: string | null;
  },
): Promise<{
  adjusted: boolean;
  previousAmount: number | null;
  newAmount: number | null;
  chargeId: string | null;
  adjustmentId: string | null;
  delta: number | null;
}> {
  const charge = await findOrderWorkCharge(tx, input.orderId, input.ledgerChargeId);
  if (!charge) {
    return {
      adjusted: false,
      previousAmount: null,
      newAmount: null,
      chargeId: null,
      adjustmentId: null,
      delta: null,
    };
  }

  const newAmount =
    input.newTotalPrice != null && Number.isFinite(input.newTotalPrice)
      ? input.newTotalPrice
      : 0;

  const previousAmount = await getOrderWorkChargeNet(tx, input.orderId, charge.amount);
  if (Math.abs(previousAmount - newAmount) < 1e-9) {
    return {
      adjusted: false,
      previousAmount,
      newAmount,
      chargeId: charge.id,
      adjustmentId: null,
      delta: 0,
    };
  }

  const delta = newAmount - previousAmount;
  const now = new Date();
  const reason = (input.reason ?? "").trim() || "עדכון מחיר";

  const adjustment = await tx.payment.create({
    data: {
      doctorId: charge.doctorId ?? input.doctorId ?? null,
      orderId: input.orderId,
      serialNumber: input.serialNumber,
      patientName: input.patientName ?? charge.patientName ?? null,
      amount: delta,
      type: "ADJUSTMENT",
      status: "PENDING",
      description: priceAdjustmentDescription({
        serialNumber: input.serialNumber,
        previousAmount,
        newAmount,
        reason,
      }),
      createdAt: now,
    },
  });

  const doctorId = charge.doctorId ?? input.doctorId;
  if (doctorId && delta !== 0) {
    // Same sign convention as CHARGE: positive delta increases debt (decrements balance).
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
    previousAmount,
    newAmount,
    chargeId: charge.id,
    adjustmentId: adjustment.id,
    delta,
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
  reason?: string | null;
  adjustmentId?: string | null;
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
      chargeId: input.chargeId,
      ledgerChargeId: input.chargeId,
      adjustmentId: input.adjustmentId ?? null,
      oldPrice: input.previousAmount,
      newPrice: input.newAmount,
      previousAmount: input.previousAmount,
      newAmount: input.newAmount,
      difference: input.newAmount - input.previousAmount,
      delta: input.newAmount - input.previousAmount,
      reason: input.reason ?? null,
      changedBy: input.actorId,
      changedAt: new Date().toISOString(),
    },
  });
}
