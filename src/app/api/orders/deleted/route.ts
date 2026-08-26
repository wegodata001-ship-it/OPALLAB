import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk } from "@/lib/api/response";
import { assertCanDeleteOrder, requireSessionUser } from "@/lib/rbac";

/** List soft-deleted orders — ADMIN/OWNER only. */
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertCanDeleteOrder(user, "ORDER_DELETED_LIST");
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const deletedBy = url.searchParams.get("deletedBy") || null;
    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;

    const orders = await appDataService.listDeletedOrders({
      q,
      from: from && !Number.isNaN(from.getTime()) ? from : null,
      to: to && !Number.isNaN(to.getTime()) ? to : null,
      deletedBy,
    });
    return jsonOk({ orders });
  } catch (error) {
    return jsonError(error);
  }
}
