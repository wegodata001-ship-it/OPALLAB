import { jsonError, jsonOk } from "@/lib/api/response";
import { assertCanManageShipments, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { appDataService } from "@/lib/services/app-data.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanManageShipments(user);
    const { id } = await context.params;
    const shipment = await appDataService.lockShipment(id, user.id);
    return jsonOk({ shipment });
  } catch (error) {
    return jsonError(error);
  }
}
