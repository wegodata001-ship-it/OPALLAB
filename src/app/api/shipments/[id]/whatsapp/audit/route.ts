import { jsonError, jsonOk } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/audit-log";
import { assertCanManageShipments, assertModuleAccess, requireSessionUser } from "@/lib/rbac";

/**
 * Client-side WhatsApp audit events (OPEN_WHATSAPP / SUCCESS / ERROR).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "shipping", "SHIPPING_MODULE");
    await assertCanManageShipments(user);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      details?: Record<string, unknown>;
    };
    const action = body.action === "SUCCESS" || body.action === "OPEN_WHATSAPP" || body.action === "ERROR"
      ? body.action
      : "ERROR";

    await writeAuditLog({
      userId: user.id,
      action,
      entityType: "Shipment",
      entityId: id,
      details: body.details ?? {},
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
