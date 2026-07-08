import { getSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) return jsonOk({ user: null });
    const user = await appDataService.getUserById(userId);
    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}
