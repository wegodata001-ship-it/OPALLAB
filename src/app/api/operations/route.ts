import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import {
  assertCanManageLabSettings,
  assertCanManagePeople,
  logForbiddenAttempt,
  requireSessionUser,
} from "@/lib/rbac";
import { isSystemAdminUser } from "@/lib/user-roles";
import type {
  AttendanceMethod,
  AttendanceRecord,
  AttendanceCheckInMeta,
  AttendanceLocationMeta,
  LabSettings,
} from "@/lib/types";

export async function POST(request: Request) {
  try {
    const sessionUserId = await requireSessionUserId();
    const body = await parseJsonBody<
      | { action: "check-in"; userId: string; method?: AttendanceMethod; meta?: AttendanceCheckInMeta }
      | { action: "check-out"; userId: string; method?: AttendanceMethod; meta?: AttendanceLocationMeta }
      | { action: "nfc-toggle"; nfcTagId: string; meta?: AttendanceCheckInMeta }
      | { action: "update"; id: string; updates: Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "notes">> }
      | { action: "lab-settings"; updates: Partial<LabSettings> }
    >(request);

    if (body.action === "check-in") {
      if (body.userId !== sessionUserId) {
        const user = await requireSessionUser();
        await logForbiddenAttempt({
          user,
          action: "ATTENDANCE_CHECKIN_OTHER",
          entityId: body.userId,
        });
        throw new AppError("FORBIDDEN", "אין הרשאה לרשום נוכחות עבור משתמש אחר", 403);
      }
      await appDataService.checkIn(body.userId, body.method, body.meta);
      return jsonOk({ ok: true });
    }
    if (body.action === "check-out") {
      if (body.userId !== sessionUserId) {
        const user = await requireSessionUser();
        await logForbiddenAttempt({
          user,
          action: "ATTENDANCE_CHECKOUT_OTHER",
          entityId: body.userId,
        });
        throw new AppError("FORBIDDEN", "אין הרשאה לרשום נוכחות עבור משתמש אחר", 403);
      }
      await appDataService.checkOut(body.userId, body.method, body.meta);
      return jsonOk({ ok: true });
    }
    if (body.action === "nfc-toggle") {
      const nfcTagId = body.nfcTagId?.trim();
      if (!nfcTagId) throw new AppError("VALIDATION_ERROR", "חסר מזהה כרטיס NFC", 400);
      const tagged = await appDataService.getUserByNfcTag(nfcTagId);
      if (!tagged) throw new AppError("NOT_FOUND", "כרטיס NFC לא משויך לעובד פעיל", 404);
      const sessionUser = await requireSessionUser();
      if (!isSystemAdminUser(sessionUser) && tagged.id !== sessionUserId) {
        await logForbiddenAttempt({
          user: sessionUser,
          action: "NFC_TOGGLE_OTHER",
          entityId: tagged.id,
          details: { nfcTagId },
        });
        throw new AppError("FORBIDDEN", "הכרטיס אינו שייך למשתמש המחובר", 403);
      }
      const result = await appDataService.toggleAttendanceByNfc(nfcTagId, body.meta);
      return jsonOk(result);
    }
    if (body.action === "update") {
      const user = await requireSessionUser();
      await assertCanManagePeople(user);
      await appDataService.updateAttendance(body.id, body.updates);
      return jsonOk({ ok: true });
    }
    if (body.action === "lab-settings") {
      const user = await requireSessionUser();
      await assertCanManageLabSettings(user);
      const labSettings = await appDataService.updateLabSettings(body.updates);
      return jsonOk({ labSettings });
    }

    return jsonError(new Error("פעולה לא תקינה"));
  } catch (error) {
    return jsonError(error);
  }
}
