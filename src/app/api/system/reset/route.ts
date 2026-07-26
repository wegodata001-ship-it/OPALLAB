import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import { assertIsOwner, requireSessionUser } from "@/lib/rbac";
import { ResetSystemService } from "@/lib/system/reset-system.service";
import { userHasRole } from "@/lib/user-roles";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const isOwner = userHasRole(user, "OWNER");
    return jsonOk({
      enabled: ResetSystemService.isEnabled(),
      allowed: isOwner && ResetSystemService.isEnabled(),
      isOwner,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertIsOwner(user, "SYSTEM_RESET");
    ResetSystemService.assertEnabled();

    const body = await parseJsonBody<{ confirmation?: string; reason?: string }>(request);
    if (body.confirmation !== "DELETE") {
      throw new AppError(
        "VALIDATION_ERROR",
        "יש להקליד DELETE לאישור המחיקה",
        400,
      );
    }

    const result = await ResetSystemService.execute({
      actorUserId: user.id,
      reason: body.reason,
    });

    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
