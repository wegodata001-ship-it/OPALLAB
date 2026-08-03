import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { requireSessionUser } from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import {
  deleteTrustedDevice,
  getDevicePunchHistory,
  listTrustedDevices,
  setTrustedDeviceStatus,
} from "@/lib/attendance/gate/service";
import { getLabGateSettings, upsertLabGateSettings } from "@/lib/attendance/gate/lab-location";

export const runtime = "nodejs";

async function assertAdmin() {
  const user = await requireSessionUser();
  if (!isSystemAdminUser(user)) {
    throw new AppError("FORBIDDEN", "ניהול מכשירים מאושרים זמין למנהלים בלבד", 403);
  }
  return user;
}

export async function GET(request: Request) {
  try {
    await assertAdmin();
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId");
    const view = url.searchParams.get("view");

    if (view === "settings") {
      const settings = await getLabGateSettings();
      return jsonOk({ settings });
    }

    if (deviceId && view === "history") {
      const history = await getDevicePunchHistory(deviceId);
      return jsonOk({ history });
    }

    const devices = await listTrustedDevices();
    const settings = await getLabGateSettings();
    return jsonOk({ devices, settings });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await assertAdmin();
    const body = await parseJsonBody<{
      action?: string;
      deviceId?: string;
      status?: "ACTIVE" | "BLOCKED" | "REVOKED";
      labLatitude?: number;
      labLongitude?: number;
      geofenceRadiusMeters?: number;
      gateToken?: string | null;
    }>(request);

    if (body.action === "update-settings") {
      await upsertLabGateSettings({
        labLatitude: body.labLatitude,
        labLongitude: body.labLongitude,
        geofenceRadiusMeters: body.geofenceRadiusMeters,
        gateToken: body.gateToken,
      });
      const settings = await getLabGateSettings();
      return jsonOk({ settings });
    }

    if (!body.deviceId || !body.status) {
      throw new AppError("VALIDATION_ERROR", "חסר מזהה מכשיר או סטטוס", 400);
    }
    const updated = await setTrustedDeviceStatus(body.deviceId, body.status);
    return jsonOk({ device: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await assertAdmin();
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId");
    if (!deviceId) throw new AppError("VALIDATION_ERROR", "חסר מזהה מכשיר", 400);
    await deleteTrustedDevice(deviceId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
