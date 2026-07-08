import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import type { Doctor, User } from "@/lib/types";

export async function POST(request: Request) {
  try {
    await requireSessionUserId();
    const body = await parseJsonBody<
      | { entity: "user"; action: "add"; data: Omit<User, "id" | "createdAt" | "updatedAt"> }
      | { entity: "user"; action: "update"; id: string; updates: Partial<User> }
      | { entity: "doctor"; action: "add"; data: Omit<Doctor, "id" | "createdAt" | "updatedAt" | "balance" | "paymentStatus"> }
      | { entity: "doctor"; action: "update"; id: string; updates: Partial<Doctor> }
      | { entity: "courier"; action: "add"; data: Omit<import("@/lib/types").Courier, "id"> }
    >(request);

    if (body.entity === "user" && body.action === "add") {
      const user = await appDataService.addUser(body.data);
      return jsonOk({ user });
    }
    if (body.entity === "user" && body.action === "update") {
      await appDataService.updateUser(body.id, body.updates);
      return jsonOk({ ok: true });
    }
    if (body.entity === "doctor" && body.action === "add") {
      const doctor = await appDataService.addDoctor(body.data);
      return jsonOk({ doctor });
    }
    if (body.entity === "doctor" && body.action === "update") {
      await appDataService.updateDoctor(body.id, body.updates);
      return jsonOk({ ok: true });
    }
    if (body.entity === "courier" && body.action === "add") {
      const courier = await appDataService.addCourier(body.data);
      return jsonOk({ courier });
    }

    return jsonError(new Error("פעולה לא תקינה"));
  } catch (error) {
    return jsonError(error);
  }
}
