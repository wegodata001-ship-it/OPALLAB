import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import type { AttendanceMethod, AttendanceRecord, AttendanceCheckInMeta, AttendanceLocationMeta, LabSettings } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const sessionUserId = await requireSessionUserId();
    const body = await parseJsonBody<
      | { action: "check-in"; userId: string; method?: AttendanceMethod; meta?: AttendanceCheckInMeta }
      | { action: "check-out"; userId: string; method?: AttendanceMethod; meta?: AttendanceLocationMeta }
      | { action: "update"; id: string; updates: Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "notes">> }
      | { action: "lab-settings"; updates: Partial<LabSettings> }
    >(request);

    if (body.action === "check-in") {
      if (body.userId !== sessionUserId) {
        throw new AppError("FORBIDDEN", "אין הרשאה לרשום נוכחות עבור משתמש אחר", 403);
      }
      await appDataService.checkIn(body.userId, body.method, body.meta);
      return jsonOk({ ok: true });
    }
    if (body.action === "check-out") {
      if (body.userId !== sessionUserId) {
        throw new AppError("FORBIDDEN", "אין הרשאה לרשום נוכחות עבור משתמש אחר", 403);
      }
      await appDataService.checkOut(body.userId, body.method, body.meta);
      return jsonOk({ ok: true });
    }
    if (body.action === "update") {
      await appDataService.updateAttendance(body.id, body.updates);
      return jsonOk({ ok: true });
    }
    if (body.action === "lab-settings") {
      const labSettings = await appDataService.updateLabSettings(body.updates);
      return jsonOk({ labSettings });
    }

    return jsonError(new Error("פעולה לא תקינה"));
  } catch (error) {
    return jsonError(error);
  }
}
