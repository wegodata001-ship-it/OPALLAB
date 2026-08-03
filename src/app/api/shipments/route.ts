import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import { assertCanManageShipments, assertModuleAccess, requireSessionUser } from "@/lib/rbac";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanManageShipments(user);
    const body = await parseJsonBody<{
      orderId: string;
      deliveryNote: string;
      courier?: { name: string; phone: string };
      signature?: {
        dataUrl: string;
        signerName?: string | null;
        deviceId?: string | null;
      } | null;
    }>(request);

    console.info("[shipment:api] post:start", {
      userId: user.id,
      orderId: body.orderId,
      deliveryNote: body.deliveryNote,
      courier: body.courier?.name,
      hasSignature: Boolean(body.signature?.dataUrl),
    });

    if (!body.orderId?.trim()) {
      throw new AppError("VALIDATION_ERROR", "חסר מזהה הזמנה", 400);
    }
    if (!body.deliveryNote?.trim()) {
      throw new AppError("VALIDATION_ERROR", "חסר מספר תעודת משלוח", 400);
    }
    if (!body.courier?.name?.trim()) {
      throw new AppError("VALIDATION_ERROR", "יש לבחור שליח לפני אישור המשלוח", 400);
    }

    const shipment = await appDataService.createShipment(
      body.orderId,
      body.deliveryNote,
      user.id,
      body.courier,
      body.signature?.dataUrl
        ? {
            dataUrl: body.signature.dataUrl,
            signerName: body.signature.signerName,
            deviceId: body.signature.deviceId,
            ip: clientIp(request.headers),
          }
        : undefined,
    );
    console.info("[shipment:api] post:ok", { shipmentId: shipment.id });
    return jsonOk({ shipment });
  } catch (error) {
    console.error("[shipment:api] post:failed", error);
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
