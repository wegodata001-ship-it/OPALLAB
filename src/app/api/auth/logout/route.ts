import { clearSessionCookie } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function POST() {
  try {
    await clearSessionCookie();
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
