import { jsonError } from "@/lib/api/response";
import { writeAuditLog } from "@/lib/audit-log";
import { AppError } from "@/lib/errors/app-error";
import { renderDrillWorkbook } from "@/lib/inventory/inventory-drill-export";
import { renderInventoryReport, type ReportRequest } from "@/lib/inventory/inventory-report-pdf";
import type { InventoryReportKind } from "@/lib/inventory/inventory-reports";
import { assertModuleAccess, requireSessionUser } from "@/lib/rbac";

const KINDS = new Set<InventoryReportKind>(["drills", "current-stock", "count-full", "differences", "uncounted", "movements", "low-zero"]);

function dateParam(value: string | null, end: boolean) {
  if (!value) return undefined;
  const date = new Date(`${value}T${end ? "23:59:59" : "00:00:00"}`);
  if (Number.isNaN(date.getTime())) throw new AppError("VALIDATION_ERROR", "טווח התאריכים אינו תקין", 400);
  return date;
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await assertModuleAccess(user, "inventory", "DRILLS_REPORT");
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
    const kind = url.searchParams.get("kind") ?? "drills";
    if (!KINDS.has(kind as InventoryReportKind)) throw new AppError("VALIDATION_ERROR", "סוג דוח לא תקין", 400);
    const report: ReportRequest = {
      kind: kind as InventoryReportKind,
      scope: "filtered",
      categories: ["DRILLS"],
      models: url.searchParams.get("models")?.split(",").filter(Boolean) ?? [],
      materials: url.searchParams.get("materials")?.split(",").filter(Boolean) ?? [],
      numbers: url.searchParams.get("numbers")?.split(",").filter(Boolean) ?? [],
      from: dateParam(url.searchParams.get("from"), false),
      to: dateParam(url.searchParams.get("to"), true),
      zeroOnly: url.searchParams.get("zero") === "1",
      differencesOnly: url.searchParams.get("differences") === "1",
      uncountedOnly: false,
      images: true,
      barcodes: true,
      producedBy: user.name,
    };
    if (format === "xlsx") {
      const file = await renderDrillWorkbook(report);
      await writeAuditLog({
        userId: user.id,
        action: "INVENTORY_REPORT",
        entityType: "InventoryReport",
        entityId: `drills-${report.kind}`,
        details: { format },
      });
      return new Response(new Uint8Array(file.buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${file.filename}"`,
        },
      });
    }
    const pdf = await renderInventoryReport(report);
    await writeAuditLog({
      userId: user.id,
      action: "INVENTORY_REPORT",
      entityType: "InventoryReport",
      entityId: `drills-${report.kind}`,
      details: { format, productCount: pdf.productCount },
    });
    return new Response(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
