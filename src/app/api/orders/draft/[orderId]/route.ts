import { appDataService } from "@/lib/services/app-data.service";
import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertCanCreateOrder, requireSessionUser } from "@/lib/rbac";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertCanCreateOrder(user);
    const { orderId } = await context.params;
    const order = await appDataService.getDraftOrder(orderId, user.id);
    if (!order) throw new AppError("NOT_FOUND", "טיוטה לא נמצאה", 404);
    return jsonOk({ order });
  } catch (error) {
    return jsonError(error);
  }
}
