import { requireSessionUserId } from "@/lib/auth/session";
import { appDataService } from "@/lib/services/app-data.service";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";
import type { CreateDoctorInput, Doctor, UpdateDoctorInput, User, UserRole } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const actorId = await requireSessionUserId();
    const body = await parseJsonBody<
      | { entity: "user"; action: "add"; data: Omit<User, "id" | "createdAt" | "updatedAt"> }
      | { entity: "user"; action: "update"; id: string; updates: Partial<User> & { password?: string } }
      | { entity: "doctor"; action: "add"; data: CreateDoctorInput }
      | { entity: "doctor"; action: "update"; id: string; updates: UpdateDoctorInput }
      | { entity: "courier"; action: "add"; data: Omit<import("@/lib/types").Courier, "id"> }
      | { entity: "courier"; action: "update"; id: string; updates: Partial<import("@/lib/types").Courier> }
    >(request);

    if (body.entity === "user" && body.action === "add") {
      const roles = body.data.roles?.length ? body.data.roles : [body.data.role];
      const user = await appDataService.addUser({ ...body.data, roles }, actorId);
      return jsonOk({ user });
    }
    if (body.entity === "user" && body.action === "update") {
      await appDataService.updateUser(body.id, body.updates, actorId);
      return jsonOk({ ok: true });
    }
    if (body.entity === "doctor" && body.action === "add") {
      const doctor = await appDataService.addDoctor(body.data, actorId);
      return jsonOk({ doctor });
    }
    if (body.entity === "doctor" && body.action === "update") {
      const doctor = await appDataService.updateDoctor(body.id, body.updates, actorId);
      return jsonOk({ doctor });
    }
    if (body.entity === "courier" && body.action === "add") {
      const courier = await appDataService.addCourier(body.data);
      return jsonOk({ courier });
    }
    if (body.entity === "courier" && body.action === "update") {
      await appDataService.updateCourier(body.id, body.updates, actorId);
      return jsonOk({ ok: true });
    }

    return jsonError(new Error("פעולה לא תקינה"));
  } catch (error) {
    return jsonError(error);
  }
}
