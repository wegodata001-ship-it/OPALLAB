import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";

export async function POST(request: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await parseJsonBody<{
      orderId: string;
      deliveryNote: string;
      courier?: { name: string; phone: string };
    }>(request);
    const shipment = await appDataService.createShipment(
      body.orderId,
      body.deliveryNote,
      userId,
      body.courier,
    );
    return jsonOk({ shipment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  try {
    await requireSessionUserId();
    return jsonOk({ deliveryNote: appDataService.previewDeliveryNote() });
  } catch (error) {
    return jsonError(error);
  }
}
