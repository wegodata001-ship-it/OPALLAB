import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanEditOrder, requireSessionUser } from "@/lib/rbac";
import type { UpdateOrderInput } from "@/lib/types";

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanEditOrder(user);
    const input = await parseJsonBody<UpdateOrderInput>(request);
    await appDataService.updateOrder(input, user.id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
