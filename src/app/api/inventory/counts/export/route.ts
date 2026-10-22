import { jsonError } from "@/lib/api/response";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { buildInventoryExport } from "@/lib/inventory/inventory-count-export";
import { parseInventoryModuleType } from "@/lib/inventory/inventory-count";
import { AppError } from "@/lib/errors/app-error";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "INVENTORY_COUNT_EXPORT");
    const url = new URL(request.url);
    const type = parseInventoryModuleType(url.searchParams.get("type"));
    const format = url.searchParams.get("format");
    const kind = url.searchParams.get("kind");
    if (format !== "html" && format !== "pdf" && format !== "xlsx") throw new AppError("VALIDATION_ERROR", "פורמט לא תקין", 400);
    if (kind !== "table" && kind !== "sheet" && kind !== "report") throw new AppError("VALIDATION_ERROR", "סוג הדפסה לא תקין", 400);
    const file = await buildInventoryExport({
      type,
      format,
      kind,
      blind: url.searchParams.get("blind") === "1",
      countId: url.searchParams.get("countId") ?? undefined,
      counterName: url.searchParams.get("counterName") ?? undefined,
      location: url.searchParams.get("location") ?? undefined,
      notes: url.searchParams.get("notes") ?? undefined,
    });
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `${format === "html" ? "inline" : "attachment"}; filename="${file.filename}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
