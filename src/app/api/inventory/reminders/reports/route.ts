import { jsonError } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { canViewInventoryReminders } from "@/lib/inventory/inventory-reminders";
import { parseReminderReportKind, renderReminderPdf, renderReminderWorkbook } from "@/lib/inventory/inventory-reminder-reports";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "INVENTORY_REMINDER_REPORT");
    if (!canViewInventoryReminders(user)) throw new AppError("FORBIDDEN", "הדוח זמין למנהל ולמזכירה", 403);
    const url = new URL(request.url);
    const kind = parseReminderReportKind(url.searchParams.get("kind"));
    const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
    const body = format === "pdf" ? await renderReminderPdf(kind) : await renderReminderWorkbook(kind);
    const filename = `opal-inventory-${kind}.${format === "pdf" ? "pdf" : "xlsx"}`;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
