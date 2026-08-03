import { AppError } from "@/lib/errors/app-error";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { punchViaTrustedDevice } from "@/lib/attendance/gate/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{
      deviceKey?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      intendedAction?: "check-in" | "check-out";
      photoPath?: string | null;
      device?: {
        browser?: string;
        os?: string;
        deviceType?: string;
        userAgent?: string;
        screenSize?: string;
        timezone?: string;
      };
    }>(request);

    if (!body.deviceKey) {
      throw new AppError("VALIDATION_ERROR", "מזהה מכשיר חסר", 400);
    }
    if (body.intendedAction !== "check-in" && body.intendedAction !== "check-out") {
      throw new AppError("VALIDATION_ERROR", "יש לבחור כניסה או יציאה", 400, {
        code: "ACTION_REQUIRED",
      });
    }
    if (body.latitude == null || body.longitude == null) {
      throw new AppError("VALIDATION_ERROR", "נדרש GPS לרישום נוכחות", 400, {
        code: "GPS_REQUIRED",
      });
    }

    const result = await punchViaTrustedDevice({
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
      intendedAction: body.intendedAction,
      photoPath: body.photoPath,
      headers: request.headers,
    });

    const durationLabel =
      result.action === "check-out" && result.durationHours != null
        ? ` · משך עבודה: ${result.durationHours.toFixed(1)} שע׳`
        : "";

    return jsonOk({
      ...result,
      message:
        result.action === "check-in"
          ? `כניסה נרשמה בהצלחה`
          : `יציאה נרשמה בהצלחה${durationLabel}`,
    });
  } catch (error) {
    return jsonError(error);
  }
}
