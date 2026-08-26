import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageOrderCatalog, requireSessionUser } from "@/lib/rbac";

export async function GET() {
  try {
    await requireSessionUser();
    const splintTypes = await appDataService.listSplintTypes();
    return jsonOk({ splintTypes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanManageOrderCatalog(user);
    const body = await parseJsonBody<{ name: string; code?: string; sortOrder?: number }>(request);
    const splintType = await appDataService.createSplintType(body);
    return jsonOk({ splintType });
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
      name?: string;
      isActive?: boolean;
      sortOrder?: number;
      orderedIds?: string[];
    }>(request);

    if (body.orderedIds?.length) {
      const splintTypes = await appDataService.reorderSplintTypes(body.orderedIds);
      return jsonOk({ splintTypes });
    }

    if (!body.id) {
      throw new AppError("VALIDATION_ERROR", "חסר מזהה סוג סד", 400);
    }

    const splintType = await appDataService.updateSplintType({
      id: body.id,
      name: body.name,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
    });
    return jsonOk({ splintType });
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
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה סוג סד", 400);
    const result = await appDataService.deleteSplintType(id);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
