import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function GET() {
  try {
    const userId = await requireSessionUserId();
    const snapshot = await appDataService.getSnapshotForUser(userId);
    return jsonOk(snapshot);
  } catch (error) {
    return jsonError(error);
  }
}
