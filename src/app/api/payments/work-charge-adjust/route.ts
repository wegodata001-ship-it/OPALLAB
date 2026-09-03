import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanAdjustWorkCharge, requireSessionUser } from "@/lib/rbac";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanAdjustWorkCharge(user);
    const body = await parseJsonBody<{
      orderId: string;
      newPrice: number;
      reason: string;
    }>(request);

    const result = await appDataService.adminAdjustWorkChargePrice(
      {
        orderId: body.orderId,
        newPrice: Number(body.newPrice),
        reason: String(body.reason ?? ""),
      },
      user,
    );

    return jsonOk({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
