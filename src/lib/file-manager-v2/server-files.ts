import { buildFileViewUrl, getOrderFileFolderId } from "@/lib/file-utils";
import type { FmFile } from "@/lib/file-manager-v2/types";
import { detectFmFileKind } from "@/lib/file-manager-v2/preview";
import { parseSlotFromNotes } from "@/lib/orders/upload-slots";
import type { OrderUploadSlotId } from "@/lib/orders/upload-slots";
import type { OrderFile } from "@/lib/types";

function serverKind(mime: string, name: string): FmFile["kind"] {
  const fake = new File([], name, { type: mime });
  return detectFmFileKind(fake);
}

export function orderFileToFm(file: OrderFile): FmFile {
  const kind = serverKind(file.mimeType ?? "", file.fileName);
  let previewUrl: string | null = null;
  if (kind === "image" && file.orderId) {
    previewUrl = buildFileViewUrl(file.orderId, getOrderFileFolderId(file));
  } else if (file.thumbnailPath && file.orderId) {
    previewUrl = buildFileViewUrl(file.orderId, `${getOrderFileFolderId(file)}/thumb`);
  }

  return {
    id: file.id,
    fileId: file.id,
    fileName: file.fileName,
    fileSize: file.fileSize ?? 0,
    mimeType: file.mimeType ?? "application/octet-stream",
    kind,
    previewUrl,
    progress: 100,
    status: "done",
    retryCount: 0,
    orderId: file.orderId,
    addedAt: new Date(file.uploadedAt).getTime(),
  };
}

export function filterFilesForSlot(files: OrderFile[], slotId: OrderUploadSlotId): OrderFile[] {
  return files.filter((f) => {
    if (f.isCurrent === false) return false;
    const fromNotes = parseSlotFromNotes(f.notes);
    return fromNotes === slotId;
  });
}

export async function fetchOrderFiles(orderId: string): Promise<OrderFile[]> {
  const res = await fetch(`/api/orders/draft/${orderId}`, { credentials: "include" });
  if (res.ok) {
    const json = (await res.json()) as {
      success?: boolean;
      data?: { order?: { files?: OrderFile[] } };
    };
    if (json.success && json.data?.order?.files) {
      return json.data.order.files;
    }
  }
  const snap = await fetch("/api/data", { credentials: "include" });
  if (!snap.ok) return [];
  const data = (await snap.json()) as {
    success?: boolean;
    data?: { orders?: { id: string; files?: OrderFile[] }[] };
  };
  const order = data.data?.orders?.find((o) => o.id === orderId);
  return order?.files ?? [];
}
