import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanCreateOrder, requireSessionUser } from "@/lib/rbac";
import type { CreateOrderInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanCreateOrder(user);
    const input = await parseJsonBody<CreateOrderInput>(request);
    const order = await appDataService.createOrder(input, user.id);
    return jsonOk({ order });
  } catch (error) {
    return jsonError(error);
  }
}
