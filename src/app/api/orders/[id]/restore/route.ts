import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk } from "@/lib/api/response";
import { clientIp } from "@/lib/api/client-ip";
import { assertCanDeleteOrder, requireSessionUser } from "@/lib/rbac";

/** Restore a soft-deleted order — ADMIN/OWNER only. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertCanDeleteOrder(user, "ORDER_RESTORE");
    const { id } = await context.params;
    const order = await appDataService.restoreDeletedOrder({
      orderId: id,
      userId: user.id,
      ip: clientIp(request.headers),
    });
    return jsonOk({ order });
  } catch (error) {
    return jsonError(error);
  }
}
