export function buildDeliveryReadyWhatsAppMessage(input: {
  orderNumber: string;
  pdfPublicUrl: string;
}): string {
  return [
    "שלום,",
    "",
    "ההזמנה שלכם מוכנה.",
    "",
    "מספר הזמנה:",
    input.orderNumber,
    "",
    "ניתן לצפות ולהוריד את קובץ ה־PDF בקישור:",
    "",
    input.pdfPublicUrl,
    "",
    "בברכה,",
    "OPAL LAB",
  ].join("\n");
}

export function buildWaMeUrl(phoneDigits: string, text: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

export function buildPublicDeliveryPdfUrl(origin: string, serialNumber: string): string {
  const base = origin.replace(/\/$/, "");
  const file = `${serialNumber.trim()}.pdf`;
  return `${base}/files/orders/${encodeURIComponent(file)}`;
}
