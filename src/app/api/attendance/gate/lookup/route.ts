import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { lookupTrustedDevice } from "@/lib/attendance/gate/service";
import { getLabGateSettings } from "@/lib/attendance/gate/lab-location";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{ deviceKey?: string }>(request);
    const settings = await getLabGateSettings();

    // Official fixed URL /attendance/checkin — no rotating token required
    const result = await lookupTrustedDevice(body.deviceKey ?? "");
    return jsonOk({
      ...result,
      geofenceEnabled: settings.geofenceEnabled,
      geofenceRadiusMeters: settings.geofenceRadiusMeters,
      checkinUrl: "https://opallab.vercel.app/attendance/checkin",
    });
  } catch (error) {
    return jsonError(error);
  }
}
