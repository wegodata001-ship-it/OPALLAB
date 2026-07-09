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

    const body = await parseJsonBody<
      | { action: "movement"; movement: Omit<InventoryMovement, "id" | "createdAt"> }
      | { action: "category"; category: { name: string; color: string } }
      | { action: "update"; itemId: string; updates: Partial<InventoryItem> }
      | { action: "delete"; itemId: string }
      | { action: "transfer-category"; itemId: string; toCategory: string; notes?: string }
      | { action: "transfer-warehouse"; itemId: string; toLocation: string; notes?: string }
      | { action: "stock-out"; itemId: string; quantity: number; reason: string; notes?: string }
      | { action: "stock-in"; itemId: string; quantity: number; unitCost: number; supplier?: string; notes?: string }
      | { action: "history"; itemId: string }
    >(request);

    if (body.action === "movement" && body.movement) {
      await appDataService.addInventoryMovement(body.movement);
      return jsonOk({ ok: true });
    }
    if (body.action === "category" && body.category) {
      const category = await appDataService.addInventoryCategory(body.category.name, body.category.color);
      return jsonOk({ category });
    }
    if (body.action === "update" && body.itemId && body.updates) {
      await appDataService.updateInventoryItem(body.itemId, body.updates, userId);
      return jsonOk({ ok: true });
    }
    if (body.action === "delete" && body.itemId) {
      await appDataService.deleteInventoryItem(body.itemId, userId);
      return jsonOk({ ok: true });
    }
    if (body.action === "transfer-category") {
      await appDataService.transferInventoryCategory(body.itemId, body.toCategory, userId, body.notes);
      return jsonOk({ ok: true });
    }
    if (body.action === "transfer-warehouse") {
      await appDataService.transferInventoryWarehouse(body.itemId, body.toLocation, userId, body.notes);
      return jsonOk({ ok: true });
    }
    if (body.action === "stock-out") {
      await appDataService.stockOutInventory({
        itemId: body.itemId,
        quantity: body.quantity,
        reason: body.reason,
        performedBy: userId,
        notes: body.notes,
      });
      return jsonOk({ ok: true });
    }
    if (body.action === "stock-in") {
      await appDataService.stockInInventory({
        itemId: body.itemId,
        quantity: body.quantity,
        unitCost: body.unitCost,
        supplier: body.supplier,
        performedBy: userId,
        notes: body.notes,
      });
      return jsonOk({ ok: true });
    }
    if (body.action === "history") {
      const history = await appDataService.getItemAuditHistory(body.itemId);
      return jsonOk({ history });
    }

    throw new AppError("VALIDATION_ERROR", "פעולת מלאי לא תקינה", 400);
  } catch (error) {
    return jsonError(error);
  }
}
