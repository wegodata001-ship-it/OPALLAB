import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanCreateOrder, requireSessionUser } from "@/lib/rbac";
import type { CreateOrderInput, UpdateOrderInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanCreateOrder(user);
    let doctorId: string | undefined;
    try {
      const body = await parseJsonBody<{ doctorId?: string }>(request);
      doctorId = body.doctorId;
    } catch {
      doctorId = undefined;
    }
    const order = await appDataService.createDraftOrder(user.id, { doctorId });
    return jsonOk({ order });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanCreateOrder(user);
    const input = await parseJsonBody<UpdateOrderInput>(request);
    if (!input.orderId) {
      throw new AppError("VALIDATION_ERROR", "חסר מזהה טיוטה", 400);
    }
    const order = await appDataService.updateDraftOrder(input, user.id);
    return jsonOk({ order });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanCreateOrder(user);
    const input = await parseJsonBody<CreateOrderInput & { orderId: string }>(request);
    if (!input.orderId) {
      throw new AppError("VALIDATION_ERROR", "חסר מזהה טיוטה", 400);
    }
    const order = await appDataService.finalizeDraftOrder(input, user.id);
    return jsonOk({ order });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanCreateOrder(user);
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");
    if (!orderId) {
      throw new AppError("VALIDATION_ERROR", "חסר מזהה טיוטה", 400);
    }
    await appDataService.discardDraftOrder(orderId, user.id);
    return jsonOk({ deleted: true, orderId });
  } catch (error) {
    return jsonError(error);
  }
}
