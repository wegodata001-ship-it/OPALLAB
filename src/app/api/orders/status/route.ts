import { prisma } from "@/lib/prisma";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import {
  assertAllowedStatusTransition,
  assertCanFreelyChangeOrderStatus,
  requireSessionUser,
} from "@/lib/rbac";
import type { UpdateOrderStatusInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const input = await parseJsonBody<UpdateOrderStatusInput>(request);

    await assertCanFreelyChangeOrderStatus(user, input.status);

    const order = await prisma.order.findUnique({ where: { id: input.orderId } });
    if (!order) throw new AppError("NOT_FOUND", "הזמנה לא נמצאה", 404);

    await assertAllowedStatusTransition(user, order.status, input.status);

    await appDataService.updateOrderStatus({
      ...input,
      changedBy: user.id,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
