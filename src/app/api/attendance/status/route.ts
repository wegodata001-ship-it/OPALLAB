import { requireSessionUserId } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { mapAttendance } from "@/lib/mappers/prisma-to-app";
import { appDataService } from "@/lib/services/app-data.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireSessionUserId();
    const openRecord = await appDataService.getOpenAttendanceRecord(userId);

    const response = jsonOk({
      hasOpenRecord: openRecord != null,
      record: openRecord ? mapAttendance(openRecord) : null,
    });
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
