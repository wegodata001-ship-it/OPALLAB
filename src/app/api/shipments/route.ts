import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageShipments, assertModuleAccess, requireSessionUser } from "@/lib/rbac";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanManageShipments(user);
    const body = await parseJsonBody<{
      orderId: string;
      deliveryNote: string;
      courier?: { name: string; phone: string };
    }>(request);
    const shipment = await appDataService.createShipment(
      body.orderId,
      body.deliveryNote,
      user.id,
      body.courier,
    );
    return jsonOk({ shipment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanManageShipments(user);
    return jsonOk({ deliveryNote: appDataService.previewDeliveryNote() });
  } catch (error) {
    return jsonError(error);
  }
}
