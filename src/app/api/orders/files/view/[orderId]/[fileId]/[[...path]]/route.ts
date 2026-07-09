import { NextRequest } from "next/server";
import { requireSessionUserId } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { getMimeTypeFromFileName, isDentalScanHtml } from "@/lib/file-utils";
import { prisma } from "@/lib/prisma";
import { downloadStorageFile, STORAGE_BUCKETS } from "@/lib/supabase/storage";

function injectHtmlBase(html: string, baseHref: string): string {
  const baseTag = `<base href="${baseHref}">`;
  if (/<base[\s>]/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  return `<!DOCTYPE html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string; fileId: string; path?: string[] }> },
) {
  try {
    const userId = await requireSessionUserId();
    const { orderId, fileId, path } = await context.params;
    const snapshot = await appDataService.getSnapshotForUser(userId);
    if (!snapshot.orders.some((order) => order.id === orderId)) {
      throw new AppError("FORBIDDEN", "אין גישה להזמנה זו", 403);
    }

    const folderFiles = await prisma.orderFile.findMany({
      where: {
        orderId,
        storagePath: { startsWith: `${orderId}/${fileId}/` },
      },
    });
    if (!folderFiles.length) {
      throw new AppError("NOT_FOUND", "תיקיית קובץ לא נמצאה", 404);
    }

    const relativePath = path?.length ? path.join("/") : folderFiles[0].fileName;
    if (relativePath.includes("..")) {
      throw new AppError("VALIDATION_ERROR", "נתיב קובץ לא תקין", 400);
    }

    const storagePath = `${orderId}/${fileId}/${relativePath}`;
    const { buffer, contentType } = await downloadStorageFile(STORAGE_BUCKETS.ORDER_FILES, storagePath);
    const ext = relativePath.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = contentType || getMimeTypeFromFileName(relativePath);

    if (ext === "html" || ext === "htm" || mimeType === "text/html") {
      const baseHref = `/api/orders/files/view/${orderId}/${fileId}/`;
      const html = injectHtmlBase(buffer.toString("utf-8"), baseHref);
      const scanViewer = isDentalScanHtml(html);
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Opal-Scan-Viewer": scanViewer ? "1" : "0",
          "Cache-Control": "private, no-cache",
        },
      });
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(error.message, { status: error.status });
    }
    console.error("[file-view]", error);
    return new Response("לא ניתן להציג את הקובץ", { status: 500 });
  }
}
