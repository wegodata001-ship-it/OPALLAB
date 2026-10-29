import type { InventoryCountStatus } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/audit-log";
import { AppError } from "@/lib/errors/app-error";
import { loadInventoryDashboard, renderDashboardPdf, type DashboardFilters } from "@/lib/inventory/inventory-dashboard";
import { listReportCounts, listReportProducts } from "@/lib/inventory/inventory-report-data";
import { renderInventoryWorkbook } from "@/lib/inventory/inventory-report-excel";
import { applyProductFilters, renderInventoryReport, selectCounts, type ReportRequest } from "@/lib/inventory/inventory-report-pdf";
import { MODULE_LABELS, REPORT_KINDS, REPORT_LABELS, type InventoryReportKind } from "@/lib/inventory/inventory-reports";
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
    materials: url.searchParams.get("materials")?.split(",").filter(Boolean) ?? [],
    from,
    to,
    countId: url.searchParams.get("countId") || undefined,
    countStatus: (status as InventoryCountStatus | null) || undefined,
    userId: url.searchParams.get("userId") || undefined,
    differencesOnly: url.searchParams.get("differences") === "1",
    uncountedOnly: url.searchParams.get("uncounted") === "1",
    zeroOnly: url.searchParams.get("zero") === "1",
    stock: url.searchParams.get("stock") || undefined,
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
    const format = url.searchParams.get("format");
    if (url.searchParams.get("view") === "dashboard" && format !== "pdf" && format !== "xlsx") {
      const filters: DashboardFilters = {
        from: parseDate(url.searchParams.get("from")),
        to: parseDate(url.searchParams.get("to")),
        modules: url.searchParams.get("categories")?.split(",").filter(Boolean) ?? [],
        model: url.searchParams.get("model") ?? "",
        stock: url.searchParams.get("stock") ?? "",
        userId: url.searchParams.get("userId") ?? "",
        query: url.searchParams.get("q") ?? "",
        page: Number(url.searchParams.get("page") ?? "1") || 1,
        pageSize: Number(url.searchParams.get("pageSize") ?? "20") || 20,
        sort: (["name", "category", "quantity", "status"].includes(url.searchParams.get("sort") ?? "") ? url.searchParams.get("sort") : "name") as DashboardFilters["sort"],
        direction: url.searchParams.get("dir") === "desc" ? "desc" : "asc",
      };
      if (filters.to && url.searchParams.get("to")?.length === 10) filters.to = new Date(filters.to.getTime() + 24 * 60 * 60 * 1000 - 1);
      return jsonOk(await loadInventoryDashboard(user, filters));
    }
    if (format === "preview") {
      const report = requestFromUrl(url, user.name);
      const [products, counts] = await Promise.all([listReportProducts(), listReportCounts()]);
      const visible = applyProductFilters(products, report);
      const previewCounts = selectCounts(counts, report);
      const countRows = previewCounts.slice(0, 12).map((count) => [count.category, `#${count.serial}`, count.status, count.createdByName]);
      return jsonOk({
        title: REPORT_LABELS[report.kind],
        total: report.kind.startsWith("count") ? previewCounts.length : visible.length,
        columns: report.kind.startsWith("count") ? ["קטגוריה", "ספירה", "מצב", "עובד"] : ["קטגוריה", "שם", "כמות", "ברקוד"],
        rows: report.kind.startsWith("count") ? countRows : visible.slice(0, 12).map((row) => [row.category, row.name, row.quantity === null ? "—" : String(row.quantity), row.barcode || "אין"]),
      });
    }
    if (format === "xlsx") {
      const report = requestFromUrl(url, user.name);
      const file = await renderInventoryWorkbook(report);
      await writeAuditLog({
        userId: user.id,
        action: "INVENTORY_REPORT",
        entityType: "InventoryReport",
        entityId: report.kind,
        details: { kind: report.kind, format: "xlsx", productCount: file.productCount },
      });
      return new Response(new Uint8Array(file.buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${file.filename}"`,
        },
      });
    }
    if (url.searchParams.get("view") === "dashboard" && format === "pdf") {
      const filters: DashboardFilters = {
        from: parseDate(url.searchParams.get("from")),
        to: parseDate(url.searchParams.get("to")),
        modules: url.searchParams.get("categories")?.split(",").filter(Boolean) ?? [],
        model: url.searchParams.get("model") ?? "",
        stock: url.searchParams.get("stock") ?? "",
        userId: url.searchParams.get("userId") ?? "",
        query: url.searchParams.get("q") ?? "",
        page: 1,
        pageSize: 50,
        sort: "name",
        direction: "asc",
      };
      const data = await loadInventoryDashboard(user, filters);
      const file = await renderDashboardPdf({
        title: "דוחות וניתוח מלאי",
        producedBy: user.name,
        filters: data.stockNote,
        headers: ["קטגוריה", "שם", "כמות", "מינימום", "סטטוס", "ברקוד"],
        rows: data.items.map((row) => [row.category, row.name, row.quantity === null ? "—" : String(row.quantity), row.minQuantity === null ? "—" : String(row.minQuantity), row.statusLabel, row.barcode || "אין"]),
      });
      return new Response(new Uint8Array(file.buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.filename}"` } });
    }
    if (format !== "pdf") {
      const [products, counts] = await Promise.all([listReportProducts(), listReportCounts()]);
      const employees = new Map<string, string>();
      for (const count of counts) employees.set(count.createdById, count.createdByName);
      return jsonOk({
        productCount: products.length,
        categories: Object.entries(MODULE_LABELS).filter(([id]) => id !== "CLASSIC").map(([id, label]) => ({ id, label })),
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
