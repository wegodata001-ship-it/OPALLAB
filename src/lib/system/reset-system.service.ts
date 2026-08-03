import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { emptyOperationalStorage } from "@/lib/supabase/empty-bucket";
import { AppError } from "@/lib/errors/app-error";

export type ResetSystemResult = {
  deleted: Record<string, number>;
  storageRemoved: Record<string, number>;
  reason: string;
};

/**
 * Client-handover reset: clears orders, shipments, and attendance only.
 * Keeps users, roles, inventory, doctors, couriers, lab settings, and system config.
 */
export class ResetSystemService {
  /** Production requires ALLOW_SYSTEM_RESET=true. Dev/test allowed unless explicitly false. */
  static isEnabled(): boolean {
    const flag = process.env.ALLOW_SYSTEM_RESET?.trim().toLowerCase();
    if (flag === "true" || flag === "1" || flag === "yes") return true;
    if (flag === "false" || flag === "0" || flag === "no") return false;
    return process.env.NODE_ENV !== "production";
  }

  static assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new AppError(
        "FORBIDDEN",
        "איפוס נתוני מערכת אינו מאופשר בסביבה זו. הגדר ALLOW_SYSTEM_RESET=true כדי לאפשר.",
        403,
      );
    }
  }

  /**
   * DB deletes run in a single transaction (rollback on failure).
   * Related storage cleanup runs after a successful commit.
   */
  static async execute(input: {
    actorUserId: string;
    reason?: string;
  }): Promise<ResetSystemResult> {
    this.assertEnabled();

    const reason = (input.reason?.trim() || "Client handover reset").slice(0, 500);
    const deleted: Record<string, number> = {};

    await prisma.$transaction(async (tx) => {
      // Order dependents first
      deleted.inventoryUsage = (await tx.inventoryUsage.deleteMany()).count;
      deleted.orderPayment = (await tx.payment.deleteMany({ where: { orderId: { not: null } } })).count;
      deleted.shipment = (await tx.shipment.deleteMany()).count;
      deleted.orderStatusHistory = (await tx.orderStatusHistory.deleteMany()).count;
      deleted.orderFile = (await tx.orderFile.deleteMany()).count;
      deleted.order = (await tx.order.deleteMany()).count;
      deleted.patient = (await tx.patient.deleteMany()).count;

      deleted.attendanceRecord = (await tx.attendanceRecord.deleteMany()).count;
      deleted.trustedDevice = (await tx.trustedDevice.deleteMany()).count;
    });

    let storageRemoved: Record<string, number>;
    try {
      storageRemoved = await emptyOperationalStorage();
    } catch (error) {
      throw new AppError(
        "STORAGE_ERROR",
        "ההזמנות/משלוחים/נוכחות נמחקו, אך מחיקת הקבצים ב-Storage נכשלה. נסה שוב או נקה ידנית.",
        500,
        error,
      );
    }

    await writeAuditLog({
      userId: input.actorUserId,
      action: "SYSTEM_RESET",
      entityType: "system",
      entityId: "reset",
      details: {
        reason,
        scope: ["orders", "shipments", "attendance"],
        deleted,
        storageRemoved,
        at: new Date().toISOString(),
      },
    });

    return {
      deleted,
      storageRemoved,
      reason,
    };
  }
}
