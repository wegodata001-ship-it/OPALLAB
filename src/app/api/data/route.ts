import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function GET() {
  try {
    const snapshot = await appDataService.getSnapshot();
    return jsonOk(snapshot);
  } catch (error) {
    return jsonError(error);
  }
}
