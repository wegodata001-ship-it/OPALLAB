import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { requireSessionUser } from "@/lib/rbac";
import { registerTrustedDevice } from "@/lib/attendance/gate/service";
import { isDoctorPortalUser } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    if (isDoctorPortalUser(user)) {
      throw new AppError("FORBIDDEN", "שער הנוכחות מיועד לעובדי המעבדה בלבד", 403);
    }

    const body = await parseJsonBody<{
      deviceKey?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      device?: {
        browser?: string;
        os?: string;
        deviceType?: string;
        userAgent?: string;
        screenSize?: string;
        timezone?: string;
      };
    }>(request);

    if (!body.deviceKey || body.deviceKey.length < 16) {
      throw new AppError("VALIDATION_ERROR", "מזהה מכשיר חסר", 400);
    }
    if (body.latitude == null || body.longitude == null) {
      throw new AppError(
        "VALIDATION_ERROR",
        "יש לאשר הרשאת מיקום כדי לבצע רישום נוכחות.",
        400,
      );
    }

    const device = await registerTrustedDevice({
      userId: user.id,
      deviceKey: body.deviceKey,
      gps: {
        latitude: body.latitude,
        longitude: body.longitude,
        accuracy: body.accuracy,
      },
      device: {
        browser: body.device?.browser ?? "Unknown",
        os: body.device?.os ?? "Unknown",
        deviceType: body.device?.deviceType ?? "Unknown",
        userAgent: body.device?.userAgent ?? "",
        screenSize: body.device?.screenSize ?? "",
        timezone: body.device?.timezone ?? "",
      },
      headers: request.headers,
    });

    return jsonOk({
      deviceId: device.id,
      registeredAt: device.registeredAt,
      message: "המכשיר נרשם בהצלחה כמכשיר מאושר",
    });
  } catch (error) {
    return jsonError(error);
  }
}
