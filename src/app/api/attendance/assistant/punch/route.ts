import { AppError } from "@/lib/errors/app-error";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { clientIp } from "@/lib/api/client-ip";
import { mapAttendance } from "@/lib/mappers/prisma-to-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Session-authenticated punch for attendance-only assistants (and permitted modules). */
export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "assistant-attendance", "ASSISTANT_ATTENDANCE");

    const body = await parseJsonBody<{
      action?: "check-in" | "check-out";
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

    if (body.action !== "check-in" && body.action !== "check-out") {
      throw new AppError("VALIDATION_ERROR", "יש לבחור כניסה או יציאה", 400);
    }

    const meta = {
      latitude: body.latitude,
      longitude: body.longitude,
      accuracy: body.accuracy,
      ipAddress: clientIp(request.headers) ?? undefined,
      device: body.device
        ? {
            browser: body.device.browser ?? "Unknown",
            os: body.device.os ?? "Unknown",
            deviceType: body.device.deviceType ?? "Unknown",
            userAgent: body.device.userAgent ?? "",
            screenSize: body.device.screenSize ?? "",
            timezone: body.device.timezone ?? "",
          }
        : undefined,
    };

    if (body.action === "check-in") {
      await appDataService.checkIn(user.id, "MANUAL", meta);
    } else {
      await appDataService.checkOut(user.id, "MANUAL", meta);
    }

    const openRecord = await appDataService.getOpenAttendanceRecord(user.id);
    return jsonOk({
      action: body.action,
      hasOpenRecord: openRecord != null,
      record: openRecord ? mapAttendance(openRecord) : null,
      message: body.action === "check-in" ? "כניסה נרשמה בהצלחה" : "היציאה בוצעה בהצלחה",
    });
  } catch (error) {
    return jsonError(error);
  }
}
