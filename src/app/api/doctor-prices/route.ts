import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanManageOrderCatalog, requireSessionUser } from "@/lib/rbac";

export async function GET(request: Request) {
  try {
    await requireSessionUser();
    const url = new URL(request.url);
    const doctorId = url.searchParams.get("doctorId") ?? undefined;
    const prices = await appDataService.listDoctorPrices(doctorId);
    return jsonOk({ prices });
  } catch (error) {
    return jsonError(error);
  }
}

/** Batch save doctor price book — ADMIN / OWNER only. */
export async function PUT(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanManageOrderCatalog(user);
    const body = await parseJsonBody<{
      doctorId?: string;
      items?: Array<{ catalogOptionId: string; price: number | null }>;
    }>(request);

    if (!body.doctorId) throw new AppError("VALIDATION_ERROR", "חסר מזהה רופא", 400);
    if (!Array.isArray(body.items)) {
      throw new AppError("VALIDATION_ERROR", "חסרה רשימת מחירים", 400);
    }

    const prices = await appDataService.saveDoctorPrices(body.doctorId, body.items);
    return jsonOk({ prices });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  return PUT(request);
}
