import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import {
  assertCanAdminForceCompleteProduction,
  assertCanCompleteProductionStage,
  logForbiddenAttempt,
  requireSessionUser,
} from "@/lib/rbac";
import { AppError } from "@/lib/errors/app-error";
import type { CompleteStageInput, UndoStageInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await parseJsonBody<{
      action: "complete" | "undo" | "admin-complete-production";
      input?: CompleteStageInput | UndoStageInput;
      orderId?: string;
    }>(request);

    if (body.action === "admin-complete-production") {
      await assertCanAdminForceCompleteProduction(user);
      const orderId = body.orderId?.trim();
      if (!orderId) {
        throw new AppError("VALIDATION_ERROR", "חסר מזהה הזמנה", 400);
      }
      try {
        const result = await appDataService.adminCompleteProduction(orderId, user);
        return jsonOk(result);
      } catch (error) {
        if (error instanceof AppError && error.status === 403) {
          await logForbiddenAttempt({
            user,
            action: "ORDER_ADMIN_COMPLETE_PRODUCTION",
            entityType: "Order",
            entityId: orderId,
          });
        }
        throw error;
      }
    }

    if (body.action === "complete") {
      const input = body.input as CompleteStageInput;
      await assertCanCompleteProductionStage(user, input.stage);
      try {
        await appDataService.completeStage(input, user);
      } catch (error) {
        if (error instanceof AppError && error.status === 403) {
          await logForbiddenAttempt({
            user,
            action: `STAGE_COMPLETE_${input.stage}`,
            entityType: "Order",
            entityId: input.orderId,
          });
        }
        throw error;
      }
    } else if (body.action === "undo") {
      const input = body.input as UndoStageInput;
      try {
        await appDataService.undoStage(input, user);
      } catch (error) {
        if (error instanceof AppError && error.status === 403) {
          await logForbiddenAttempt({
            user,
            action: `STAGE_UNDO_${input.stage}`,
            entityType: "Order",
            entityId: input.orderId,
          });
        }
        throw error;
      }
    } else {
      throw new AppError("VALIDATION_ERROR", "פעולה לא חוקית", 400);
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
