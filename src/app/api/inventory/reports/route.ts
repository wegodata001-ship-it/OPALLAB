import type { InventoryCountStatus } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/audit-log";
import { AppError } from "@/lib/errors/app-error";
import { listReportCounts, listReportProducts } from "@/lib/inventory/inventory-report-data";
import { renderInventoryReport, type ReportRequest } from "@/lib/inventory/inventory-report-pdf";
import { MODULE_LABELS, REPORT_KINDS, type InventoryReportKind } from "@/lib/inventory/inventory-reports";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";

function parseDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("VALIDATION_ERROR", "תאריך לא תקין", 400);
  return date;
}

function requestFromUrl(url: URL, producedBy: string): ReportRequest {
  const kind = url.searchParams.get("kind");
  if (!kind || !REPORT_KINDS.includes(kind as InventoryReportKind)) throw new AppError("VALIDATION_ERROR", "סוג דוח לא תקין", 400);
  const status = url.searchParams.get("countStatus");
  if (status && status !== "DRAFT" && status !== "APPROVED" && status !== "CANCELLED") {
    throw new AppError("VALIDATION_ERROR", "מצב ספירה לא תקין", 400);
  }
  const from = parseDate(url.searchParams.get("from"));
  let to = parseDate(url.searchParams.get("to"));
  if (to && url.searchParams.get("to")?.length === 10) to = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    kind: kind as InventoryReportKind,
    scope: url.searchParams.get("scope") === "filtered" ? "filtered" : "all",
    categories: url.searchParams.get("categories")?.split(",").filter(Boolean) ?? [],
    models: url.searchParams.get("models")?.split(",").filter(Boolean) ?? [],
    from,
    to,
    countId: url.searchParams.get("countId") || undefined,
    countStatus: (status as InventoryCountStatus | null) || undefined,
    userId: url.searchParams.get("userId") || undefined,
    differencesOnly: url.searchParams.get("differences") === "1",
    uncountedOnly: url.searchParams.get("uncounted") === "1",
    zeroOnly: url.searchParams.get("zero") === "1",
    images: url.searchParams.get("images") !== "0",
    barcodes: url.searchParams.get("barcodes") !== "0",
    producedBy,
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "INVENTORY_REPORT");
    const url = new URL(request.url);
    if (url.searchParams.get("format") !== "pdf") {
      const [products, counts] = await Promise.all([listReportProducts(), listReportCounts()]);
      const employees = new Map<string, string>();
      for (const count of counts) employees.set(count.createdById, count.createdByName);
      return jsonOk({
        productCount: products.length,
        categories: Object.entries(MODULE_LABELS).map(([id, label]) => ({ id, label })),
        models: [...new Set(products.map((product) => product.model).filter(Boolean))],
        counts: counts.map((count) => ({
          id: count.id,
          serial: count.serial,
          category: count.category,
          module: count.module,
          status: count.status,
          createdAt: count.createdAt,
          createdById: count.createdById,
          createdByName: count.createdByName,
          counted: count.lines.filter((line) => line.countedQuantity !== null).length,
          expected: count.lines.length,
        })),
        employees: [...employees.entries()].map(([id, name]) => ({ id, name })),
      });
    }
    const report = requestFromUrl(url, user.name);
    const file = await renderInventoryReport(report);
    await writeAuditLog({
      userId: user.id,
      action: "INVENTORY_REPORT",
      entityType: "InventoryReport",
      entityId: report.kind,
      details: { kind: report.kind, scope: report.scope, countId: report.countId ?? null, productCount: file.productCount },
    });
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
