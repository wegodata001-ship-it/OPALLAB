import { prisma } from "@/lib/prisma";
import { getProtectedUserWhere } from "@/lib/people/protected-users";
import { emptyAllDemoStorage } from "@/lib/supabase/empty-bucket";
import { deleteAuthUser } from "@/lib/supabase/auth-admin";

export type ResetToBaseResult = {
  protectedUsers: { id: string; username: string; name: string }[];
  deleted: Record<string, number>;
  storageRemoved: Record<string, number>;
};

export async function resetDatabaseToBase(): Promise<ResetToBaseResult> {
  const protectedUsers = await prisma.user.findMany({
    where: getProtectedUserWhere(),
    select: { id: true, username: true, name: true, authUserId: true },
  });
  const protectedIds = protectedUsers.map((u) => u.id);

  const usersToRemove = await prisma.user.findMany({
    where: { id: { notIn: protectedIds } },
    select: { id: true, authUserId: true },
  });

  const deleted: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    deleted.inventoryUsage = (await tx.inventoryUsage.deleteMany()).count;
    deleted.inventoryMovement = (await tx.inventoryMovement.deleteMany()).count;
    deleted.inventoryItem = (await tx.inventoryItem.deleteMany()).count;
    deleted.inventoryCategory = (
      await tx.inventoryCategory.deleteMany({ where: { isSystem: false } })
    ).count;

    deleted.payment = (await tx.payment.deleteMany()).count;
    deleted.shipment = (await tx.shipment.deleteMany()).count;
    deleted.orderStatusHistory = (await tx.orderStatusHistory.deleteMany()).count;
    deleted.orderFile = (await tx.orderFile.deleteMany()).count;
    deleted.order = (await tx.order.deleteMany()).count;
    deleted.patient = (await tx.patient.deleteMany()).count;

    deleted.attendanceRecord = (await tx.attendanceRecord.deleteMany()).count;
    deleted.auditLog = (await tx.auditLog.deleteMany()).count;

    deleted.doctor = (await tx.doctor.deleteMany()).count;
    deleted.courier = (await tx.courier.deleteMany()).count;

    deleted.user = (await tx.user.deleteMany({ where: { id: { notIn: protectedIds } } })).count;
  });

  for (const user of usersToRemove) {
    if (user.authUserId) {
      try {
        await deleteAuthUser(user.authUserId);
      } catch (error) {
        console.warn("[reset-to-base] auth delete skipped:", user.id, error);
      }
    }
  }

  const storageRemoved = await emptyAllDemoStorage();

  return {
    protectedUsers: protectedUsers.map(({ id, username, name }) => ({ id, username, name })),
    deleted,
    storageRemoved,
  };
}
