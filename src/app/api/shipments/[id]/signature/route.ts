import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageShipments, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { appDataService } from "@/lib/services/app-data.service";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanManageShipments(user);
    const { id } = await context.params;
    const body = await parseJsonBody<{
      dataUrl?: string;
      signerName?: string | null;
      deviceId?: string | null;
    }>(request);

    if (!body.dataUrl) {
      throw new AppError("VALIDATION_ERROR", "חסרה תמונת חתימה", 400);
    }

    const shipment = await appDataService.setShipmentSignature(
      id,
      user.id,
      {
        dataUrl: body.dataUrl,
        signerName: body.signerName,
        deviceId: body.deviceId,
        ip: clientIp(request.headers),
      },
      "replace",
    );

    return jsonOk({ shipment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanManageShipments(user);
    const { id } = await context.params;
    const shipment = await appDataService.deleteShipmentSignature(id, user.id);
    return jsonOk({ shipment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanManageShipments(user);
    const { id } = await context.params;
    await appDataService.logShipmentSignatureView(id, user.id);
    return jsonOk({ viewed: true });
  } catch (error) {
    return jsonError(error);
  }
}
