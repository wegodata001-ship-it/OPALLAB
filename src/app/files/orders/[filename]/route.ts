import { getDeliveryPdfBufferBySerial } from "@/lib/shipping/delivery-note-pdf";

export const runtime = "nodejs";

/**
 * Public delivery-note PDF:
 * GET /files/orders/OP26-8419.pdf
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  const serial = decodeURIComponent(filename).replace(/\.pdf$/i, "").trim();
  if (!serial) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await getDeliveryPdfBufferBySerial(serial);
  if (!buffer) {
    return new Response("PDF not found", { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${serial}.pdf"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
