import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import {
  assertCanBulkSignShipments,
  assertModuleAccess,
  requireSessionUser,
} from "@/lib/rbac";
import { appDataService } from "@/lib/services/app-data.service";

function clientIp(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

/** ADMIN / OWNER only — one signature applied to many unsigned shipments. */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanBulkSignShipments(user);

    const body = await parseJsonBody<{
      shipmentIds?: string[];
      dataUrl?: string;
      signerName?: string | null;
      deviceId?: string | null;
    }>(request);

    if (!Array.isArray(body.shipmentIds) || body.shipmentIds.length === 0) {
      throw new AppError("VALIDATION_ERROR", "לא נבחרו משלוחים", 400);
    }
    if (!body.dataUrl?.trim()) {
      throw new AppError("VALIDATION_ERROR", "חסרה תמונת חתימה", 400);
    }

    const result = await appDataService.bulkAddShipmentSignatures(
      body.shipmentIds,
      user.id,
      {
        dataUrl: body.dataUrl,
        signerName: body.signerName,
        deviceId: body.deviceId,
        ip: clientIp(request.headers),
      },
    );

    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
