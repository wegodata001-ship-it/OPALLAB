import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import type { CompleteStageInput, UndoStageInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const userId = await requireSessionUserId();
    const body = await parseJsonBody<{ action: "complete" | "undo"; input: CompleteStageInput | UndoStageInput }>(request);
    const currentUser = await appDataService.getUserById(userId);
    if (!currentUser) return jsonError(new Error("משתמש לא נמצא"));

    if (body.action === "complete") {
      await appDataService.completeStage(body.input as CompleteStageInput, currentUser);
    } else {
      await appDataService.undoStage(body.input as UndoStageInput, currentUser);
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
