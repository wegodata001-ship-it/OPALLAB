import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import type { UpdateOrderInput } from "@/lib/types";

export async function PATCH(request: Request) {
  try {
    const userId = await requireSessionUserId();
    const input = await parseJsonBody<UpdateOrderInput>(request);
    await appDataService.updateOrder(input, userId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
