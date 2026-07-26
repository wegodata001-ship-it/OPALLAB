import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { assertCanCompleteProductionStage, logForbiddenAttempt, requireSessionUser } from "@/lib/rbac";
import { AppError } from "@/lib/errors/app-error";
import type { CompleteStageInput, UndoStageInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await parseJsonBody<{
      action: "complete" | "undo";
      input: CompleteStageInput | UndoStageInput;
    }>(request);

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
    } else {
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
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
