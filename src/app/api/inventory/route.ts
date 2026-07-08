import { requireSessionUserId } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import type { InventoryItem, InventoryMovement } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const userId = await requireSessionUserId();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const payloadRaw = formData.get("payload");
      if (typeof payloadRaw !== "string") {
        throw new AppError("VALIDATION_ERROR", "נתוני פריט חסרים", 400);
      }
      const payload = JSON.parse(payloadRaw) as Omit<InventoryItem, "id" | "createdAt" | "updatedAt"> & {
        initialCost?: number;
      };
      const image = formData.get("image");
      const imageFile =
        image instanceof File && image.size > 0
          ? {
              buffer: Buffer.from(await image.arrayBuffer()),
              fileName: image.name,
              mimeType: image.type || "image/jpeg",
            }
          : undefined;

      const item = await appDataService.addInventoryItem(
        payload,
        userId,
        payload.initialCost,
        imageFile,
      );
      return jsonOk({ item });
    }

    const body = await parseJsonBody<{
      action: "movement" | "category" | "update";
      movement?: Omit<InventoryMovement, "id" | "createdAt">;
      category?: { name: string; color: string };
      itemId?: string;
      updates?: Partial<InventoryItem>;
    }>(request);

    if (body.action === "movement" && body.movement) {
      await appDataService.addInventoryMovement(body.movement);
      return jsonOk({ ok: true });
    }
    if (body.action === "category" && body.category) {
      const category = await appDataService.addInventoryCategory(body.category.name, body.category.color);
      return jsonOk({ category });
    }
    if (body.action === "update" && body.itemId && body.updates) {
      await appDataService.updateInventoryItem(body.itemId, body.updates);
      return jsonOk({ ok: true });
    }

    throw new AppError("VALIDATION_ERROR", "פעולת מלאי לא תקינה", 400);
  } catch (error) {
    return jsonError(error);
  }
}
