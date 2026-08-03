import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { LAB_INFO } from "@/lib/constants/labels";
import { buildDeliveryNoteHtml } from "@/lib/shipping/delivery-note-html";
import {
  assertStorageObjectExists,
  downloadStorageFile,
  uploadFile,
  STORAGE_BUCKETS,
} from "@/lib/supabase/storage";
import { writeAuditLog } from "@/lib/audit-log";

export function buildDeliveryNotePdfStoragePath(shipmentId: string): string {
  return `Shipments/${shipmentId}/delivery-note.pdf`;
}

/** Also stored under a serial-keyed path for stable public URLs. */
export function buildPublicOrderPdfStoragePath(serialNumber: string): string {
  const safe = serialNumber.replace(/[\\/:*?"<>|]+/g, "-").trim() || "order";
  return `public/orders/${safe}.pdf`;
}

async function htmlToPortraitPdf(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      landscape: false,
      printBackground: true,
      margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });
    await page.close();
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function wrapDeliveryHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 14mm; }
    body {
      font-family: "Rubik", "Noto Sans Arabic", Arial, sans-serif;
      direction: rtl;
      color: #111;
      font-size: 14px;
      line-height: 1.55;
    }
  </style>
</head>
<body>
  <div style="color:#666;font-size:12px;margin-bottom:12px;text-align:center">
    ${LAB_INFO.fullName} · ${LAB_INFO.phone} · ${LAB_INFO.email}
  </div>
  ${bodyHtml}
  <div style="margin-top:28px;font-size:11px;color:#888;text-align:center">
    ${LAB_INFO.businessId} · ${LAB_INFO.location}
  </div>
</body>
</html>`;
}

async function signatureDataUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { buffer, contentType } = await downloadStorageFile(STORAGE_BUCKETS.ORDER_FILES, path);
    const mime = contentType || "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export type EnsureDeliveryPdfResult = {
  storagePath: string;
  publicStoragePath: string;
  created: boolean;
  serialNumber: string;
  deliveryNote: string;
  doctorPhone: string | null;
};

/**
 * If PDF already in Storage — reuse. Otherwise generate + upload.
 */
export async function ensureDeliveryNotePdf(input: {
  shipmentId: string;
  userId: string;
}): Promise<EnsureDeliveryPdfResult> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: input.shipmentId },
    include: {
      order: {
        include: {
          doctor: true,
          patient: true,
        },
      },
    },
  });
  if (!shipment?.order) {
    throw new AppError("NOT_FOUND", "משלוח לא נמצא", 404);
  }

  const serialNumber = shipment.order.serialNumber;
  const storagePath = buildDeliveryNotePdfStoragePath(shipment.id);
  const publicStoragePath = buildPublicOrderPdfStoragePath(serialNumber);

  let exists = false;
  try {
    await assertStorageObjectExists(STORAGE_BUCKETS.ORDER_FILES, storagePath);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
    // Ensure public alias exists too
    try {
      await assertStorageObjectExists(STORAGE_BUCKETS.ORDER_FILES, publicStoragePath);
    } catch {
      const { buffer } = await downloadStorageFile(STORAGE_BUCKETS.ORDER_FILES, storagePath);
      await uploadFile(STORAGE_BUCKETS.ORDER_FILES, publicStoragePath, buffer, "application/pdf");
      await writeAuditLog({
        userId: input.userId,
        action: "UPLOAD_PDF",
        entityType: "Shipment",
        entityId: shipment.id,
        details: { phase: "public-alias", publicStoragePath, serialNumber },
      });
    }
    return {
      storagePath,
      publicStoragePath,
      created: false,
      serialNumber,
      deliveryNote: shipment.deliveryNote,
      doctorPhone: shipment.order.doctor?.phone ?? null,
    };
  }

  await writeAuditLog({
    userId: input.userId,
    action: "CREATE_PDF",
    entityType: "Shipment",
    entityId: shipment.id,
    details: { serialNumber, deliveryNote: shipment.deliveryNote },
  });

  const sigImg = await signatureDataUrl(shipment.recipientSignaturePath);
  const body = buildDeliveryNoteHtml({
    note: shipment.deliveryNote,
    order: {
      serialNumber: shipment.order.serialNumber,
      doctor: shipment.order.doctor,
      patient: shipment.order.patient,
      selectedTeeth: shipment.order.selectedTeeth,
      workTypes: shipment.order.workTypes,
      description: shipment.order.description,
      notes: shipment.order.notes,
    },
    courierLabel: shipment.courierName
      ? `${shipment.courierName}${shipment.courierPhone ? ` · ${shipment.courierPhone}` : ""}`
      : undefined,
    signature: sigImg
      ? {
          imageUrl: sigImg,
          signedAt: shipment.recipientSignedAt ?? shipment.createdAt,
          signerName: shipment.recipientSignerName,
        }
      : null,
    issuedAt: shipment.shippedAt ?? shipment.createdAt,
  });

  let pdf: Buffer;
  try {
    pdf = await htmlToPortraitPdf(wrapDeliveryHtml(body));
  } catch (err) {
    await writeAuditLog({
      userId: input.userId,
      action: "ERROR",
      entityType: "Shipment",
      entityId: shipment.id,
      details: {
        phase: "CREATE_PDF",
        message: err instanceof Error ? err.message : String(err),
      },
    });
    throw new AppError("INTERNAL_ERROR", "יצירת ה־PDF נכשלה", 500, err);
  }

  try {
    await uploadFile(STORAGE_BUCKETS.ORDER_FILES, storagePath, pdf, "application/pdf");
    await uploadFile(STORAGE_BUCKETS.ORDER_FILES, publicStoragePath, pdf, "application/pdf");
  } catch (err) {
    await writeAuditLog({
      userId: input.userId,
      action: "ERROR",
      entityType: "Shipment",
      entityId: shipment.id,
      details: {
        phase: "UPLOAD_PDF",
        message: err instanceof Error ? err.message : String(err),
      },
    });
    throw new AppError("STORAGE_ERROR", "העלאת ה־PDF נכשלה", 500, err);
  }

  await writeAuditLog({
    userId: input.userId,
    action: "UPLOAD_PDF",
    entityType: "Shipment",
    entityId: shipment.id,
    details: { storagePath, publicStoragePath, serialNumber, bytes: pdf.byteLength },
  });

  return {
    storagePath,
    publicStoragePath,
    created: true,
    serialNumber,
    deliveryNote: shipment.deliveryNote,
    doctorPhone: shipment.order.doctor?.phone ?? null,
  };
}

export async function getDeliveryPdfBufferBySerial(serialNumber: string): Promise<Buffer | null> {
  const safe = serialNumber.replace(/\.pdf$/i, "").trim();
  if (!safe) return null;

  const publicPath = buildPublicOrderPdfStoragePath(safe);
  try {
    const { buffer } = await downloadStorageFile(STORAGE_BUCKETS.ORDER_FILES, publicPath);
    return buffer;
  } catch {
    /* fall through */
  }

  const order = await prisma.order.findFirst({
    where: { serialNumber: safe },
    select: { shipment: { select: { id: true } } },
  });
  if (!order?.shipment) return null;
  const path = buildDeliveryNotePdfStoragePath(order.shipment.id);
  try {
    const { buffer } = await downloadStorageFile(STORAGE_BUCKETS.ORDER_FILES, path);
    return buffer;
  } catch {
    return null;
  }
}
