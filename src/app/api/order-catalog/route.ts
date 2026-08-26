import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageOrderCatalog, requireSessionUser } from "@/lib/rbac";
import type { OrderCatalogCategory } from "@/lib/types";

export async function GET(request: Request) {
  try {
    await requireSessionUser();
    const url = new URL(request.url);
    const category = url.searchParams.get("category") as OrderCatalogCategory | null;
    const options = await appDataService.listOrderCatalog(category ?? undefined);
    return jsonOk({ options });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanManageOrderCatalog(user);
    const body = await parseJsonBody<{
      category: OrderCatalogCategory;
      label: string;
      code?: string;
      color?: string | null;
      group?: string | null;
      sortOrder?: number;
    }>(request);
    if (!body.category) throw new AppError("VALIDATION_ERROR", "חסרה קטגוריה", 400);
    const option = await appDataService.createOrderCatalogOption(body);
    return jsonOk({ option });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanManageOrderCatalog(user);
    const body = await parseJsonBody<{
      id?: string;
      label?: string;
      color?: string | null;
      group?: string | null;
      isActive?: boolean;
      sortOrder?: number;
      category?: OrderCatalogCategory;
      orderedIds?: string[];
    }>(request);

    if (body.orderedIds?.length && body.category) {
      const options = await appDataService.reorderOrderCatalog(body.category, body.orderedIds);
      return jsonOk({ options });
    }

    if (!body.id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    const option = await appDataService.updateOrderCatalogOption({
      id: body.id,
      label: body.label,
      color: body.color,
      group: body.group,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
    });
    return jsonOk({ option });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanManageOrderCatalog(user);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה", 400);
    const result = await appDataService.deleteOrderCatalogOption(id);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
