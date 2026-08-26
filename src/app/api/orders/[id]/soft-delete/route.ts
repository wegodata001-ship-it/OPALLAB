import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk } from "@/lib/api/response";
import { clientIp } from "@/lib/api/client-ip";
import { assertCanDeleteOrder, requireSessionUser } from "@/lib/rbac";

/** Soft-delete order — ADMIN/OWNER only. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertCanDeleteOrder(user, "ORDER_SOFT_DELETE");
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { reason?: string | null };
    const order = await appDataService.softDeleteOrder({
      orderId: id,
      userId: user.id,
      reason: body.reason,
      ip: clientIp(request.headers),
    });
    return jsonOk({ order });
  } catch (error) {
    return jsonError(error);
  }
}
