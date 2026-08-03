import { AppError } from "@/lib/errors/app-error";
import { buildOrderWhereForUser } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/types";

/** Cheap ACL — no full snapshot. */
export async function assertCanAccessOrder(user: User, orderId: string): Promise<void> {
  const doctors = await prisma.doctor.findMany({
    select: { id: true, userId: true },
  });
  const where = buildOrderWhereForUser(user, doctors);

  const order = await prisma.order.findFirst({
    where: where ? { AND: [{ id: orderId }, where] } : { id: orderId },
    select: { id: true },
  });

  if (!order) {
    throw new AppError("FORBIDDEN", "אין גישה להזמנה זו", 403);
  }
}

export async function getAccessibleOrderFile(user: User, fileId: string, orderId?: string) {
  const file = await prisma.orderFile.findFirst({
    where: {
      id: fileId,
      ...(orderId ? { orderId } : {}),
    },
  });
  if (!file) throw new AppError("NOT_FOUND", "קובץ לא נמצא", 404);
  await assertCanAccessOrder(user, file.orderId);
  return file;
}
