import { jsonError, jsonOk } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit-log";
import { renderMaterialUsagePdf, renderMaterialUsageWorkbook } from "@/lib/workflow/material-usage-report";
import {
  canViewMaterialUsageReport,
  isMaterialStage,
  materialReportFacets,
  queryMaterialUsageReport,
  summarizeMaterialUses,
  type MaterialReportFilters,
  type MaterialStage,
} from "@/lib/workflow/material-usage";

function parseDate(value: string | null, endOfDay: boolean) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("VALIDATION_ERROR", "תאריך לא תקין", 400);
  if (value.length === 10 && endOfDay) return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
  return date;
}

function filtersFromUrl(url: URL): MaterialReportFilters {
  const stage = url.searchParams.get("stage") ?? "";
  if (stage && !isMaterialStage(stage)) throw new AppError("VALIDATION_ERROR", "שלב לא תקין", 400);
  return {
    from: parseDate(url.searchParams.get("from"), false),
    to: parseDate(url.searchParams.get("to"), true),
    orderSerial: url.searchParams.get("order") || undefined,
    doctor: url.searchParams.get("doctor") || undefined,
    employeeId: url.searchParams.get("employeeId") || undefined,
    stage: (stage || undefined) as MaterialStage | undefined,
    model: url.searchParams.get("model") || undefined,
    color: url.searchParams.get("color") || undefined,
    height: url.searchParams.get("height") || undefined,
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "workflow", "PRODUCTION_MATERIAL_REPORT");
    if (!canViewMaterialUsageReport(user)) throw new AppError("FORBIDDEN", "הדוח זמין למנהל ולמזכירה", 403);
    const url = new URL(request.url);
    const filters = filtersFromUrl(url);
    const format = url.searchParams.get("format");
    if (format === "pdf" || format === "xlsx") {
      const body = format === "pdf" ? await renderMaterialUsagePdf(filters) : await renderMaterialUsageWorkbook(filters);
      await writeAuditLog({
        userId: user.id,
        action: "PRODUCTION_MATERIAL_REPORT",
        entityType: "ProductionMaterialUse",
        entityId: format,
        details: { format },
      });
      return new Response(new Uint8Array(body), {
        headers: {
          "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="opal-material-usage.${format === "pdf" ? "pdf" : "xlsx"}"`,
        },
      });
    }
    const [rows, facets] = await Promise.all([queryMaterialUsageReport(filters), materialReportFacets()]);
    return jsonOk({ rows, summary: summarizeMaterialUses(rows), facets, note: facets.note });
  } catch (error) {
    return jsonError(error);
  }
}
