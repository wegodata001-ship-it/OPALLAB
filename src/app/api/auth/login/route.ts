import { appDataService } from "@/lib/services/app-data.service";
import { setSessionCookie } from "@/lib/auth/session";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/response";

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<{ username: string; password: string }>(request);
    if (!body.username || !body.password) {
      return jsonError(new Error("שם משתמש וסיסמה נדרשים"));
    }
    const user = await appDataService.login(body.username, body.password);
    await setSessionCookie(user.id);
    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}
