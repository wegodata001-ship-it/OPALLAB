import { AppError } from "@/lib/errors/app-error";
import { jsonError } from "@/lib/api/response";
import { assertCanManageInventory, requireSessionUser } from "@/lib/rbac";

/** Legacy inventory mutations are closed. Rows, quantities, and movements stay in the database. */
export async function POST(request: Request) {
  try {
    void request;
    const user = await requireSessionUser();
    await assertCanManageInventory(user);
    throw new AppError("NOT_FOUND", "ניהול המלאי הישן הוסר מהמערכת הפעילה. הנתונים נשמרו, והעבודה מתבצעת במערכת המלאי החדשה.", 410);
  } catch (error) {
    return jsonError(error);
  }
}
