import ExcelJS from "exceljs";
import { listReportCounts, listReportMovements, listReportProducts } from "@/lib/inventory/inventory-report-data";
import { readCountLine } from "@/lib/inventory/inventory-reports";
import type { ReportRequest } from "@/lib/inventory/inventory-report-pdf";

function drillsOnly(request: ReportRequest) {
  return {
    ...request,
    scope: "filtered" as const,
    categories: request.categories.length > 0 ? request.categories : ["DRILLS"],
  };
}

export async function renderDrillWorkbook(request: ReportRequest) {
  const filtered = drillsOnly(request);
  const [products, counts, movements] = await Promise.all([
    listReportProducts(),
    listReportCounts(),
    listReportMovements(filtered.from, filtered.to),
  ]);
  const rows = products.filter((row) => {
    if (row.module !== "DRILLS") return false;
    if (filtered.models.length > 0 && !filtered.models.includes(row.model)) return false;
    if (filtered.materials.length > 0 && !filtered.materials.includes(row.material)) return false;
    if (filtered.zeroOnly && row.quantity !== 0) return false;
    return true;
  });
  const drillCounts = counts.filter((count) => count.module === "DRILLS" && count.status !== "CANCELLED");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OPAL LAB";
  const sheet = workbook.addWorksheet("מקדחים", { views: [{ rightToLeft: true }] });
  if (request.kind === "movements") {
    sheet.addRow(["תאריך", "משתמש", "פריט", "פעולה", "לפני", "שינוי", "אחרי", "מקור"]);
    for (const row of movements.filter((item) => item.category === "מקדחים")) {
      sheet.addRow([row.createdAt, row.userName, row.itemName, row.action, row.quantityBefore, row.quantityChange, row.quantityAfter, row.source]);
    }
  } else if (request.kind === "count-full" || request.kind === "differences" || request.kind === "uncounted") {
    sheet.addRow(["דגם", "סוג", "ברקוד", "מלאי בפתיחה", "כמות שנספרה", "הפרש", "מצב"]);
    for (const count of drillCounts) {
      for (const line of count.lines) {
        const reading = readCountLine(line);
        if (request.kind === "differences" && reading.difference === 0) continue;
        if (request.kind === "uncounted" && reading.state !== "uncounted") continue;
        const product = rows.find((item) => item.id === line.itemId);
        sheet.addRow([
          product?.model ?? line.itemId,
          product?.material ?? "",
          product?.barcode ?? "",
          line.quantityAtStart ?? "",
          line.countedQuantity ?? "לא נספר",
          reading.difference ?? "",
          reading.label,
        ]);
      }
    }
  } else {
    sheet.addRow(["דגם", "סוג", "ברקוד", "כמות", "עודכן"]);
    for (const row of rows) sheet.addRow([row.model, row.material, row.barcode, row.quantity ?? "", row.updatedAt]);
  }
  sheet.getRow(1).font = { bold: true };
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: `opal-drills-${request.kind}.xlsx` };
}
