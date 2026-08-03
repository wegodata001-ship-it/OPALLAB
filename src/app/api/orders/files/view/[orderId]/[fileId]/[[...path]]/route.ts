import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/rbac";
import { AppError } from "@/lib/errors/app-error";
import { assertCanAccessOrder } from "@/lib/orders/assert-order-file-access";
import { getMimeTypeFromFileName, isDentalScanHtml } from "@/lib/file-utils";
import { prisma } from "@/lib/prisma";
import {
  downloadStorageFile,
  getSignedUrl,
  STORAGE_BUCKETS,
} from "@/lib/supabase/storage";

function injectHtmlBase(html: string, baseHref: string): string {
  const baseTag = `<base href="${baseHref}">`;
  if (/<base[\s>]/i.test(html)) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  return `<!DOCTYPE html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

function dirnamePath(storagePath: string): string {
  const idx = storagePath.lastIndexOf("/");
  return idx >= 0 ? storagePath.slice(0, idx) : storagePath;
}

/**
 * View route:
 * - HTML: still proxied (needs base-tag injection)
 * - Binary (STL/PLY/OBJ/images/…): 302 redirect to short-lived Signed URL (streaming from Storage)
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string; fileId: string; path?: string[] }> },
) {
  const t0 = performance.now();
  try {
    const user = await requireSessionUser();
    const { orderId, fileId, path } = await context.params;
    await assertCanAccessOrder(user, orderId);

    const byId = await prisma.orderFile.findFirst({
      where: { id: fileId, orderId },
    });

    let storagePath: string | null = null;
    let fileName = "";

    if (byId?.storagePath) {
      const baseDir = dirnamePath(byId.storagePath);
      if (path?.length) {
        if (path.some((p) => p.includes(".."))) {
          throw new AppError("VALIDATION_ERROR", "נתיב קובץ לא תקין", 400);
        }
        storagePath = `${baseDir}/${path.join("/")}`;
      } else {
        storagePath = byId.storagePath;
      }
      fileName = byId.fileName;
    } else {
      const folderFiles = await prisma.orderFile.findMany({
        where: {
          orderId,
          storagePath: { startsWith: `${orderId}/${fileId}/` },
        },
      });
      if (!folderFiles.length) {
        throw new AppError("NOT_FOUND", "קובץ לא נמצא", 404);
      }
      const relativePath = path?.length ? path.join("/") : folderFiles[0].fileName;
      if (relativePath.includes("..")) {
        throw new AppError("VALIDATION_ERROR", "נתיב קובץ לא תקין", 400);
      }
      storagePath = `${orderId}/${fileId}/${relativePath}`;
      fileName = relativePath;
    }

    if (!storagePath) throw new AppError("NOT_FOUND", "קובץ לא נמצא", 404);

    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = getMimeTypeFromFileName(fileName);
    const apiMs = Math.round(performance.now() - t0);

    // HTML still needs injection — download only for HTML
    if (ext === "html" || ext === "htm" || mimeType === "text/html") {
      const { buffer, contentType } = await downloadStorageFile(
        STORAGE_BUCKETS.ORDER_FILES,
        storagePath,
      );
      const baseHref = `/api/orders/files/view/${orderId}/${fileId}/`;
      const html = injectHtmlBase(buffer.toString("utf-8"), baseHref);
      const scanViewer = isDentalScanHtml(html);
      return new Response(html, {
        headers: {
          "Content-Type": contentType || "text/html; charset=utf-8",
          "X-Opal-Scan-Viewer": scanViewer ? "1" : "0",
          "X-Opal-Api-Ms": String(apiMs),
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    // Binary: redirect to Storage signed URL — browser streams directly (no Base64, no Next proxy)
    const signedUrl = await getSignedUrl(STORAGE_BUCKETS.ORDER_FILES, storagePath, 60 * 30);
    if (!signedUrl) {
      throw new AppError("STORAGE_ERROR", "יצירת Signed URL נכשלה", 500);
    }

    // Prefer redirect; fetch() follow redirects works for viewer
    if (request.nextUrl.searchParams.get("redirect") === "0") {
      return NextResponse.json(
        { success: true, data: { signedUrl, mimeType, apiMs } },
        {
          headers: {
            "X-Opal-Api-Ms": String(Math.round(performance.now() - t0)),
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        "X-Opal-Api-Ms": String(Math.round(performance.now() - t0)),
        "Cache-Control": "private, no-store",
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
