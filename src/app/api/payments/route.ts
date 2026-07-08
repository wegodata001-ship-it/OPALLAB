import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import type { Payment, PaymentStatus } from "@/lib/types";

export async function POST(request: Request) {
  try {
    await requireSessionUserId();
    const body = await parseJsonBody<
      | { action: "add"; payment: Omit<Payment, "id" | "createdAt"> }
      | { action: "balance"; doctorId: string; amount: number; status?: PaymentStatus }
    >(request);

    if (body.action === "add") {
      await appDataService.addPayment(body.payment);
      return jsonOk({ ok: true });
    }
    if (body.action === "balance") {
      await appDataService.updateDoctorBalance(body.doctorId, body.amount, body.status);
      return jsonOk({ ok: true });
    }

    return jsonError(new Error("פעולת תשלום לא תקינה"));
  } catch (error) {
    return jsonError(error);
  }
}
