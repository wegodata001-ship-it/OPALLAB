import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import type { CreateOrderInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const userId = await requireSessionUserId();
    const input = await parseJsonBody<CreateOrderInput>(request);
    const order = await appDataService.createOrder(input, userId);
    return jsonOk({ order });
  } catch (error) {
    return jsonError(error);
  }
}
