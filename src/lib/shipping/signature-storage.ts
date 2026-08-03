import { uploadFile, deleteFile, STORAGE_BUCKETS } from "@/lib/supabase/storage";

export function buildShipmentSignaturePath(shipmentId: string): string {
  return `Shipments/${shipmentId}/recipient-signature.png`;
}

export function decodePngDataUrl(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!m?.[1]) {
    throw new Error("פורמט חתימה לא תקין — נדרש PNG");
  }
  const buf = Buffer.from(m[1], "base64");
  if (!buf.length || buf.length > 1_500_000) {
    throw new Error("קובץ החתימה גדול מדי או ריק");
  }
  return buf;
}

export async function storeShipmentSignaturePng(
  shipmentId: string,
  dataUrl: string,
): Promise<string> {
  const path = buildShipmentSignaturePath(shipmentId);
  const buf = decodePngDataUrl(dataUrl);
  await uploadFile(STORAGE_BUCKETS.ORDER_FILES, path, buf, "image/png");
  return path;
}

export async function removeShipmentSignaturePng(storagePath: string | null | undefined) {
  if (!storagePath) return;
  try {
    await deleteFile(STORAGE_BUCKETS.ORDER_FILES, storagePath);
  } catch {
    /* ignore missing */
  }
}
