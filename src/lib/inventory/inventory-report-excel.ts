import ExcelJS from "exceljs";
import { loadLogoDataUrl } from "@/lib/attendance/pdf-v2/fonts";
import { listReportCounts, listReportMovements, listReportProducts } from "@/lib/inventory/inventory-report-data";
import { applyProductFilters, matchesReportCategory, selectCounts, type ReportRequest } from "@/lib/inventory/inventory-report-pdf";
import { REPORT_LABELS, readCountLine } from "@/lib/inventory/inventory-reports";

function stamp(sheet: ExcelJS.Worksheet, title: string, filters: string) {
  sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 5 }];
  sheet.getCell("A1").value = "OPAL LAB";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0F172A" } };
  sheet.getCell("A2").value = title;
  sheet.getCell("A2").font = { bold: true, size: 14 };
  sheet.getCell("A3").value = new Date();
  sheet.getCell("A3").numFmt = "dd/mm/yyyy hh:mm";
  sheet.getCell("B3").value = "תאריך הפקה";
  sheet.getCell("A4").value = filters || "בלי סינון נוסף";
  sheet.mergeCells("A4:H4");
}

function table(sheet: ExcelJS.Worksheet, headers: string[], rows: Array<Array<string | number | Date | null>>, startRow: number) {
  headers.forEach((header, index) => {
    const cell = sheet.getCell(startRow, index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  });
  rows.forEach((row, rowIndex) => {
    row.forEach((value, column) => {
      const cell = sheet.getCell(startRow + 1 + rowIndex, column + 1);
      cell.value = value === null ? "" : value;
      if (value instanceof Date) cell.numFmt = "dd/mm/yyyy hh:mm";
    });
  });
  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: startRow, column: 1 },
      to: { row: startRow + rows.length, column: headers.length },
    };
  }
  headers.forEach((_, index) => { sheet.getColumn(index + 1).width = 22; });
  return rows.length;
}

function filtersOf(request: ReportRequest) {
  return [
    request.categories.length ? `קטגוריות: ${request.categories.join(", ")}` : "",
    request.models.length ? `דגמים: ${request.models.join(", ")}` : "",
    request.stock ? `מצב: ${request.stock}` : "",
    request.from ? `מתאריך ${request.from.toLocaleDateString("he-IL")}` : "",
    request.to ? `עד ${request.to.toLocaleDateString("he-IL")}` : "",
    request.producedBy,
  ].filter(Boolean).join(" · ");
}

export async function renderInventoryWorkbook(request: ReportRequest) {
  const [products, counts] = await Promise.all([listReportProducts(), listReportCounts()]);
  const visibleProducts = applyProductFilters(products, request);
  const visibleCounts = selectCounts(counts, request);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OPAL LAB";
  const logo = loadLogoDataUrl();
  const summary = workbook.addWorksheet("סיכום");
  stamp(summary, REPORT_LABELS[request.kind], filtersOf(request));
  summary.getCell("A6").value = "פריטים בדוח";
  summary.getCell("B6").value = visibleProducts.length;
  summary.getCell("A7").value = "ספירות בדוח";
  summary.getCell("B7").value = visibleCounts.length;
  summary.getCell("A8").value = "הפקת הגיליון לא שינתה מלאי";
  if (logo?.startsWith("data:image/png;base64,")) {
    const imageId = workbook.addImage({ base64: logo.slice("data:image/png;base64,".length), extension: "png" });
    summary.addImage(imageId, { tl: { col: 6, row: 0 }, ext: { width: 48, height: 48 } });
  }

  const detail = workbook.addWorksheet("פירוט");
  stamp(detail, REPORT_LABELS[request.kind], filtersOf(request));
  if (request.kind === "movements") {
    const narrowed = request.scope === "filtered" && (request.models.length > 0 || request.categories.length > 0)
      ? new Set(visibleProducts.map((product) => product.id))
      : null;
    const rows = (await listReportMovements(request.from, request.to)).filter((row) => matchesReportCategory(row.category, request) && (!narrowed || narrowed.has(row.itemId)));
    table(detail, ["תאריך", "משתמש", "פריט", "קטגוריה", "פעולה", "לפני", "שינוי", "אחרי", "מקור"], rows.map((row) => [
      new Date(row.createdAt), row.userName, row.itemName, row.category, row.action, row.quantityBefore, row.quantityChange, row.quantityAfter, row.source,
    ]), 6);
  } else if (request.kind === "count-history" || request.kind === "count-status") {
    table(detail, ["מספר", "קטגוריה", "נוצרה", "מצב", "יוצר", "שורות", "נספרו"], visibleCounts.map((count) => [
      count.serial, count.category, new Date(count.createdAt), count.status, count.createdByName, count.lines.length, count.lines.filter((line) => line.countedQuantity !== null).length,
    ]), 6);
  } else if (request.kind === "differences" || request.kind === "uncounted" || request.kind === "count-full") {
    const lines = visibleCounts.flatMap((count) => count.lines.map((line) => ({ count, line, reading: readCountLine(line) })))
      .filter((row) => request.kind === "count-full" || (request.kind === "differences" ? row.reading.difference !== null && row.reading.difference !== 0 : row.reading.state === "uncounted"));
    table(detail, ["ספירה", "קטגוריה", "פריט", "כמות במערכת", "נספר", "הפרש", "מצב"], lines.map((row) => [
      row.count.serial, row.count.category, row.line.name, row.line.quantityAtStart, row.line.countedQuantity, row.reading.difference, row.reading.label,
    ]), 6);
  } else {
    table(detail, ["קטגוריה", "שם", "דגם", "מאפיין", "מידה", "ברקוד", "כמות", "מינימום", "יחידה"], visibleProducts.map((row) => [
      row.category, row.name, row.model, row.color || row.material || row.subcategory, row.size, row.barcode, row.quantity, row.minQuantity, row.unit,
    ]), 6);
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: `opal-inventory-${request.kind}.xlsx`, productCount: visibleProducts.length };
}
