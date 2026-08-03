import { LAB_INFO } from "@/lib/constants/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { OrderWithRelations, Shipment } from "@/lib/types";

type DeliveryNoteOrder = Pick<
  OrderWithRelations,
  "serialNumber" | "doctor" | "patient" | "selectedTeeth" | "workTypes" | "description" | "notes"
>;

export function buildDeliveryNoteHtml(input: {
  note: string;
  order: DeliveryNoteOrder;
  courierLabel?: string;
  /** When set, render signature block; when null/undefined — omit entirely. */
  signature?: {
    imageUrl: string;
    signedAt: Date | string;
    signerName?: string | null;
  } | null;
  issuedAt?: Date;
}): string {
  const { note, order, courierLabel, signature } = input;
  const teeth = order.selectedTeeth?.length ? order.selectedTeeth.join(", ") : "—";
  const work = order.workTypes?.length ? order.workTypes.join(", ") : "—";
  const issued = input.issuedAt ?? new Date();

  const signatureBlock = signature?.imageUrl
    ? `
        <div style="margin-top:36px;page-break-inside:avoid">
          <p style="font-weight:bold;margin:0 0 8px;color:#0f172a">חתימת מקבל</p>
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;max-width:360px">
            <img src="${signature.imageUrl}" alt="חתימת מקבל" style="max-width:100%;height:auto;display:block" />
            <p style="margin:10px 0 0;font-size:12px;color:#64748b">
              ${formatDateTime(new Date(signature.signedAt))}
              ${signature.signerName ? ` · ${signature.signerName}` : ""}
            </p>
          </div>
        </div>`
    : "";

  // Lab line only — no empty "חתימת מקבל" placeholder when unsigned
  const labLine = `
        <div style="margin-top:48px;width:45%;border-top:1px solid #94a3b8;padding-top:8px;text-align:center">
          חתימת מעבדה
        </div>`;

  return `
      <div style="font-family:Arial,sans-serif;direction:rtl;max-width:720px;margin:0 auto">
        <h1 style="text-align:center;color:#0f172a">${LAB_INFO.name}</h1>
        <h2 style="text-align:center">תעודת משלוח ${note}</h2>
        <p style="text-align:center;color:#64748b">תאריך: ${formatDate(issued)}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px" border="1" cellpadding="8">
          <tr><td><b>מספר תעודה</b></td><td>${note}</td></tr>
          <tr><td><b>מספר הזמנה</b></td><td>${order.serialNumber}</td></tr>
          <tr><td><b>רופא</b></td><td>${order.doctor.name}</td></tr>
          <tr><td><b>מרפאה</b></td><td>${order.doctor.clinic ?? order.doctor.address ?? "—"}</td></tr>
          <tr><td><b>מטופל</b></td><td>${order.patient.name}</td></tr>
          <tr><td><b>שיניים</b></td><td>${teeth}</td></tr>
          <tr><td><b>סוג עבודה</b></td><td>${work}</td></tr>
          <tr><td><b>כמות</b></td><td>1</td></tr>
          <tr><td><b>הערות</b></td><td>${order.description ?? order.notes ?? "—"}</td></tr>
          <tr><td><b>שליח</b></td><td>${courierLabel ?? "—"}</td></tr>
        </table>
        ${signatureBlock}
        ${labLine}
      </div>`;
}

export function shipmentSignatureForPdf(shipment: Shipment | null | undefined) {
  if (!shipment?.recipientSignatureUrl) return null;
  return {
    imageUrl: shipment.recipientSignatureUrl,
    signedAt: shipment.recipientSignedAt ?? shipment.createdAt,
    signerName: shipment.recipientSignerName,
  };
}
