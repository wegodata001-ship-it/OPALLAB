import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import type { UpdateOrderStatusInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    await requireSessionUserId();
    const input = await parseJsonBody<UpdateOrderStatusInput>(request);
    await appDataService.updateOrderStatus(input);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
