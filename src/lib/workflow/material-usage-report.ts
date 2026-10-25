import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { buildEmbeddedFontCss, loadLogoDataUrl } from "@/lib/attendance/pdf-v2/fonts";
import { htmlToPdfBuffer } from "@/lib/attendance/pdf-v2/render-pdf";
import { MATERIAL_STAGE_LABELS } from "@/lib/workflow/material-usage-shared";
import {
  queryMaterialUsageReport,
  summarizeMaterialUses,
  USAGE_NOTE,
  type MaterialReportFilters,
  type MaterialReportRow,
} from "@/lib/workflow/material-usage";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatWhen(date: Date) {
  return date.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
}

function rangeLabel(filters: MaterialReportFilters) {
  const from = filters.from ? formatWhen(filters.from) : "ללא התחלה";
  const to = filters.to ? formatWhen(filters.to) : "ללא סיום";
  return `${from} עד ${to}`;
}

async function filterLines(filters: MaterialReportFilters) {
  let employee = "הכל";
  if (filters.employeeId) {
    const user = await prisma.user.findUnique({ where: { id: filters.employeeId }, select: { name: true } });
    employee = user?.name ?? filters.employeeId;
  }
  return [
    ["טווח תאריכים", rangeLabel(filters)],
    ["מספר הזמנה", filters.orderSerial?.trim() || "הכל"],
    ["רופא / לקוח", filters.doctor?.trim() || "הכל"],
    ["עובד", employee],
    ["שלב", filters.stage ? MATERIAL_STAGE_LABELS[filters.stage] : "הכל"],
    ["דגם", filters.model || "הכל"],
    ["צבע", filters.color || "הכל"],
    ["גובה", filters.height || "הכל"],
  ];
}

function summaryLines(rows: MaterialReportRow[]) {
  const summary = summarizeMaterialUses(rows);
  const lines: string[][] = [
    ["הזמנות שבהן תועד חומר", String(summary.orderCount)],
    ["רשומות תיעוד", String(summary.recordCount)],
  ];
  for (const row of summary.ordersByModel) lines.push([`הזמנות לדגם ${row.name}`, String(row.count)]);
  for (const row of summary.byColor) lines.push([`לפי צבע ${row.name}`, String(row.count)]);
  for (const row of summary.byHeight) lines.push([`לפי גובה ${row.name}`, String(row.count)]);
  for (const row of summary.byEmployee) lines.push([`לפי עובד ${row.name}`, String(row.count)]);
  for (const row of summary.byStage) lines.push([`לפי שלב ${row.name}`, String(row.count)]);
  lines.push(["הבהרה", summary.note]);
  return { summary, lines };
}

export async function renderMaterialUsageWorkbook(filters: MaterialReportFilters) {
  const rows = await queryMaterialUsageReport(filters);
  const { lines } = summaryLines(rows);
  const appliedFilters = await filterLines(filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OPAL LAB";
  const sheet = workbook.addWorksheet("שימושים", { views: [{ rightToLeft: true }] });
  sheet.addRow(["OPAL LAB", "שימוש בחומרים במעקב ייצור"]);
  sheet.addRow(["הבהרה", USAGE_NOTE]);
  sheet.addRow(["תאריך", "הזמנה", "שלב", "דגם", "צבע", "גובה", "עובד", "רופא / לקוח", "הערות", "ברקוד"]);
  for (const row of rows) {
    const added = sheet.addRow([
      row.recordedAt,
      row.orderSerial,
      row.stageLabel,
      row.modelName,
      row.colorName,
      row.heightLabel,
      row.employeeName,
      row.doctorName,
      row.notes,
      row.barcode,
    ]);
    added.getCell(1).numFmt = "yyyy-mm-dd hh:mm";
  }
  if (rows.length === 0) sheet.addRow(["אין רשומות בסינון זה"]);
  const filtersSheet = workbook.addWorksheet("סינונים", { views: [{ rightToLeft: true }] });
  filtersSheet.addRow(["סינון", "ערך"]);
  for (const line of appliedFilters) filtersSheet.addRow(line);
  const summarySheet = workbook.addWorksheet("סיכומים", { views: [{ rightToLeft: true }] });
  summarySheet.addRow(["סיכום", "ערך"]);
  for (const line of lines) summarySheet.addRow(line);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function renderMaterialUsagePdf(filters: MaterialReportFilters) {
  const rows = await queryMaterialUsageReport(filters);
  const { lines } = summaryLines(rows);
  const appliedFilters = await filterLines(filters);
  const logo = loadLogoDataUrl();
  const headers = ["תאריך", "הזמנה", "שלב", "דגם", "צבע", "גובה", "עובד"];
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}">אין רשומות בסינון זה</td></tr>`
    : rows.map((row) => `<tr><td>${escapeHtml(formatWhen(row.recordedAt))}</td><td>${escapeHtml(row.orderSerial)}</td><td>${escapeHtml(row.stageLabel)}</td><td>${escapeHtml(row.modelName)}</td><td>${escapeHtml(row.colorName)}</td><td>${escapeHtml(row.heightLabel)}</td><td>${escapeHtml(row.employeeName)}</td></tr>`).join("");
  const summaryBody = lines.map((line) => `<tr><td>${escapeHtml(line[0])}</td><td>${escapeHtml(line[1])}</td></tr>`).join("");
  const filterBody = appliedFilters.map((line) => `<li>${escapeHtml(line[0])}: ${escapeHtml(line[1])}</li>`).join("");
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${buildEmbeddedFontCss()} body{font-family:"Noto Sans Hebrew",sans-serif;color:#0f172a} table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border:1px solid #e2e8f0;padding:6px;text-align:right;font-size:12px} th{background:#0f172a;color:#fff} h1{font-size:20px;margin:0} h2{font-size:14px} .meta{color:#64748b;font-size:12px} .note{margin-top:8px;font-size:12px}</style></head><body><header>${logo ? `<img src="${logo}" alt="OPAL LAB" width="42" height="42">` : ""}<h1>OPAL LAB</h1><p>שימוש בחומרים במעקב ייצור</p><p class="meta">${escapeHtml(rangeLabel(filters))}</p><p class="note">${escapeHtml(USAGE_NOTE)}</p><ul>${filterBody}</ul></header><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><h2>סיכומים</h2><table><tbody>${summaryBody}</tbody></table></body></html>`;
  return htmlToPdfBuffer(html, { landscape: true, footerLabel: "שימוש בחומרים במעקב ייצור" });
}
