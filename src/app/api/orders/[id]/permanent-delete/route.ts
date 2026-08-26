import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { clientIp } from "@/lib/api/client-ip";
import { assertCanDeleteOrder, requireSessionUser } from "@/lib/rbac";

/** Permanent delete — ADMIN/OWNER only. Body must include confirm: "DELETE". */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertCanDeleteOrder(user, "ORDER_PERMANENT_DELETE");
    const { id } = await context.params;
    const body = await parseJsonBody<{ confirm?: string }>(request);
    await appDataService.permanentlyDeleteOrder({
      orderId: id,
      userId: user.id,
      confirm: body.confirm ?? "",
      ip: clientIp(request.headers),
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
