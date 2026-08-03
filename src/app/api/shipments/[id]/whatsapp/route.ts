import { jsonError, jsonOk } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/audit-log";
import { AppError } from "@/lib/errors/app-error";
import { prisma } from "@/lib/prisma";
import { assertCanManageShipments, assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { ensureDeliveryNotePdf } from "@/lib/shipping/delivery-note-pdf";
import { normalizeWhatsAppPhone } from "@/lib/shipping/phone";
import {
  buildDeliveryReadyWhatsAppMessage,
  buildPublicDeliveryPdfUrl,
  buildWaMeUrl,
} from "@/lib/shipping/whatsapp-message";

export const runtime = "nodejs";
export const maxDuration = 120;

function resolveOrigin(request: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

/**
 * Ensure delivery-note PDF exists (create+upload if needed), then return
 * WhatsApp-ready payload with a public PDF URL. Does NOT open WhatsApp server-side.
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

    // Phone first — never open WhatsApp / generate PDF without a customer number
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: { id: true, order: { select: { doctor: { select: { phone: true } } } } },
    });
    if (!shipment) throw new AppError("NOT_FOUND", "משלוח לא נמצא", 404);

    const phone = normalizeWhatsAppPhone(shipment.order.doctor?.phone);
    if (!phone) {
      await writeAuditLog({
        userId: user.id,
        action: "ERROR",
        entityType: "Shipment",
        entityId: id,
        details: { phase: "PHONE", message: "missing doctor phone" },
      });
      throw new AppError("VALIDATION_ERROR", "לא הוגדר מספר טלפון ללקוח.", 400);
    }

    const ensured = await ensureDeliveryNotePdf({ shipmentId: id, userId: user.id });

    const origin = resolveOrigin(request);
    const pdfPublicUrl = buildPublicDeliveryPdfUrl(origin, ensured.serialNumber);

    await writeAuditLog({
      userId: user.id,
      action: "GENERATE_PUBLIC_URL",
      entityType: "Shipment",
      entityId: id,
      details: { pdfPublicUrl, serialNumber: ensured.serialNumber, created: ensured.created },
    });

    if (!/^https?:\/\//i.test(pdfPublicUrl)) {
      await writeAuditLog({
        userId: user.id,
        action: "ERROR",
        entityType: "Shipment",
        entityId: id,
        details: { phase: "GENERATE_PUBLIC_URL", pdfPublicUrl },
      });
      throw new AppError("INTERNAL_ERROR", "קישור ה־PDF הציבורי אינו תקין", 500);
    }

    // Verify the public app route can serve the PDF before opening WhatsApp
    const relative = `/files/orders/${encodeURIComponent(`${ensured.serialNumber}.pdf`)}`;
    const localProbe = await fetch(new URL(relative, request.url), {
      method: "GET",
      cache: "no-store",
    }).catch(() => null);
    if (!localProbe?.ok) {
      await writeAuditLog({
        userId: user.id,
        action: "ERROR",
        entityType: "Shipment",
        entityId: id,
        details: {
          phase: "GENERATE_PUBLIC_URL",
          message: "public URL not reachable",
          pdfPublicUrl,
          status: localProbe?.status,
        },
      });
      throw new AppError("STORAGE_ERROR", "העלאה הצליחה אך קישור ה־PDF הציבורי אינו נגיש", 500);
    }

    const message = buildDeliveryReadyWhatsAppMessage({
      orderNumber: ensured.serialNumber,
      pdfPublicUrl,
    });
    const waUrl = buildWaMeUrl(phone, message);

    return jsonOk({
      phone,
      pdfPublicUrl,
      message,
      waUrl,
      created: ensured.created,
      serialNumber: ensured.serialNumber,
      deliveryNote: ensured.deliveryNote,
    });
  } catch (error) {
    return jsonError(error);
  }
}
