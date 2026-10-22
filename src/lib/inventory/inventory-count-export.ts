import ExcelJS from "exceljs";
import type { InventoryModuleType } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { htmlToPdfBuffer } from "@/lib/attendance/pdf-v2/render-pdf";
import { getInventoryCount, listCountableItems } from "@/lib/inventory/inventory-count";
import type { CountableItem } from "@/lib/inventory/inventory-count-items";

export const INVENTORY_MODULE_TITLE: Record<InventoryModuleType, string> = {
  ZIRCONIA: "מלאי זרקוניה",
  TITANIUM: "מלאי טיטניום",
  BMMA: "BMMA",
  DRILLS: "מלאי מקדחים",
  IMPLANTS: "מלאי שתלים",
  CLINIC_MATERIALS: "מלאי חומרים למרפאה",
  OTHER_MATERIALS: "מלאי חומרים שונים",
  DOCTOR_PARTS: "חלקים רופאים",
};

type SheetRow = {
  name: string;
  modelName: string;
  kindName: string;
  colorName: string;
  sizeName: string;
  barcode: string;
  quantity: number | null;
  counted: string;
  before: string;
  after: string;
  difference: string;
  notes: string;
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function qtyText(value: number | null) {
  return value === null ? "—" : String(value);
}

function cells(values: string[]) {
  return values.map((value) => `<td>${value}</td>`).join("");
}

export function buildInventorySheetHtml(input: {
  title: string;
  kind: "table" | "sheet" | "report";
  blind: boolean;
  counterName: string;
  location: string;
  notes: string;
  printedAt: Date;
  rows: SheetRow[];
}) {
  const showSystem = input.kind === "table" || (input.kind === "sheet" && !input.blind) || input.kind === "report";
  const headers = ["#", "שם מוצר", "דגם / סוג", "צבע / גובה / מספר", "ברקוד"];
  if (showSystem && input.kind !== "report") headers.push("כמות במערכת");
  if (input.kind === "sheet") headers.push("כמות שנספרה", "הערות");
  if (input.kind === "table") headers.push("הערות");
  if (input.kind === "report") headers.push("כמות בפתיחה", "כמות שנספרה", "כמות אחרי אישור", "הפרש", "הערות");
  const body = input.rows
    .map((row, index) => {
      const base = [
        String(index + 1),
        escapeHtml(row.name),
        escapeHtml([row.modelName, row.kindName].filter(Boolean).join(" / ")),
        escapeHtml([row.colorName, row.sizeName].filter(Boolean).join(" / ")),
        escapeHtml(row.barcode),
      ];
      if (input.kind === "report") {
        base.push(escapeHtml(qtyText(row.quantity)), escapeHtml(row.counted || "—"), escapeHtml(row.after || "—"), escapeHtml(row.difference || "—"), escapeHtml(row.notes));
      } else if (input.kind === "sheet") {
        if (showSystem) base.push(escapeHtml(qtyText(row.quantity)));
        base.push(`<span class="write"></span>`, `<span class="write"></span>`);
        return `<tr>${base.map((value, cell) => `<td class="${cell >= base.length - 2 ? "write" : ""}">${value}</td>`).join("")}</tr>`;
      } else {
        if (showSystem) base.push(escapeHtml(qtyText(row.quantity)));
        base.push("");
      }
      return `<tr>${cells(base)}</tr>`;
    })
    .join("");
  const heading = input.kind === "report" ? "דוח ספירת מלאי" : input.kind === "table" ? "טבלת מלאי" : "דף ספירה";
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.title)} — ${heading}</title>
<style>
  @page { size: A4; margin: 14mm 10mm 18mm; @bottom-center { content: "עמוד " counter(page) " / " counter(pages); font-size: 10px; font-family: Arial, sans-serif; } }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, "Segoe UI", sans-serif; color: #0f172a; }
  header { display: flex; justify-content: space-between; gap: 12px; align-items: center; border-bottom: 3px solid #c4a35a; padding-bottom: 8px; margin-bottom: 12px; }
  .logo { background: #0f172a; color: #fff; border: 2px solid #c4a35a; border-radius: 10px; padding: 8px 12px; font-weight: 800; letter-spacing: 0.08em; }
  h1 { margin: 0; font-size: 20px; }
  .meta { color: #475569; font-size: 12px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #0f172a; color: #fff; font-size: 12px; text-align: right; padding: 6px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; font-size: 12px; vertical-align: middle; }
  tr, td, th { break-inside: avoid; page-break-inside: avoid; }
  td.write { height: 42px; }
  .print { margin: 12px 0; }
  @media print { .print { display: none; } }
</style>
</head>
<body>
<button class="print" onclick="window.print()">הדפסה</button>
<header>
  <div class="logo">OPAL LAB</div>
  <div>
    <h1>${escapeHtml(heading)} — ${escapeHtml(input.title)}</h1>
    <div class="meta">תאריך: ${escapeHtml(input.printedAt.toLocaleString("he-IL"))}${input.counterName ? ` · סופר: ${escapeHtml(input.counterName)}` : ""}${input.location ? ` · מיקום: ${escapeHtml(input.location)}` : ""}</div>
    ${input.notes ? `<div class="meta">${escapeHtml(input.notes)}</div>` : ""}
    ${input.blind && input.kind === "sheet" ? `<div class="meta">ספירה עיוורת — בלי כמות מערכת</div>` : ""}
  </div>
</header>
<table>
  <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
  <tbody>${body || `<tr><td colspan="${headers.length}">אין פריטים</td></tr>`}</tbody>
</table>
</body>
</html>`;
}

function blankRow(item: CountableItem): SheetRow {
  return {
    name: item.name,
    modelName: item.modelName,
    kindName: item.kindName,
    colorName: item.colorName,
    sizeName: item.sizeName,
    barcode: item.barcode,
    quantity: item.quantity,
    counted: "",
    before: "",
    after: "",
    difference: "",
    notes: "",
  };
}

export async function buildInventoryExport(input: {
  type: InventoryModuleType;
  format: "html" | "pdf" | "xlsx";
  kind: "table" | "sheet" | "report";
  blind: boolean;
  countId?: string;
  counterName?: string;
  location?: string;
  notes?: string;
}) {
  const title = INVENTORY_MODULE_TITLE[input.type];
  let rows: SheetRow[] = [];
  let counterName = input.counterName ?? "";
  let location = input.location ?? "";
  let notes = input.notes ?? "";
  if (input.kind === "report") {
    if (!input.countId) throw new AppError("VALIDATION_ERROR", "חסרה ספירה", 400);
    const count = await getInventoryCount(input.countId);
    if (count.inventoryType !== input.type) throw new AppError("VALIDATION_ERROR", "הספירה אינה שייכת למלאי זה", 400);
    counterName = count.counterName;
    location = count.location;
    notes = count.notes;
    rows = count.lines.map((line) => ({
      name: line.name,
      modelName: line.modelName,
      kindName: line.kindName,
      colorName: line.colorName,
      sizeName: line.sizeName,
      barcode: line.barcode,
      quantity: line.quantityAtStart,
      counted: line.countedQuantity === null ? "" : String(line.countedQuantity),
      before: line.quantityBeforeApproval === null ? "" : String(line.quantityBeforeApproval),
      after: line.quantityAfter === null ? "" : String(line.quantityAfter),
      difference: line.difference === null ? "" : String(line.difference),
      notes: line.notes,
    }));
  } else {
    rows = (await listCountableItems(input.type)).map(blankRow);
  }
  const html = buildInventorySheetHtml({
    title,
    kind: input.kind,
    blind: input.kind === "sheet" ? input.blind : input.blind,
    counterName,
    location,
    notes,
    printedAt: new Date(),
    rows,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  if (input.format === "html") {
    return { buffer: Buffer.from(html, "utf8"), filename: `${input.type}-${input.kind}-${stamp}.html`, contentType: "text/html; charset=utf-8" };
  }
  if (input.format === "pdf") {
    const buffer = await htmlToPdfBuffer(html, { landscape: false, footerLabel: title });
    return { buffer, filename: `${input.type}-${input.kind}-${stamp}.pdf`, contentType: "application/pdf" };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title, { views: [{ rightToLeft: true }] });
  const headers = ["מספר", "שם מוצר", "דגם / סוג", "צבע / גובה / מספר", "ברקוד"];
  if (input.kind === "report") headers.push("כמות בפתיחה", "כמות שנספרה", "כמות אחרי אישור", "הפרש", "הערות");
  else {
    if (!input.blind || input.kind === "table") headers.push("כמות במערכת");
    if (input.kind === "sheet") headers.push("כמות שנספרה");
    headers.push("הערות");
  }
  sheet.addRow([`OPAL LAB — ${title}`]);
  sheet.addRow([counterName ? `סופר: ${counterName}` : "", location ? `מיקום: ${location}` : "", notes]);
  sheet.addRow(headers);
  rows.forEach((row, index) => {
    const values: Array<string | number> = [index + 1, row.name, [row.modelName, row.kindName].filter(Boolean).join(" / "), [row.colorName, row.sizeName].filter(Boolean).join(" / "), row.barcode];
    if (input.kind === "report") values.push(row.quantity === null ? "" : row.quantity, row.counted, row.after, row.difference, row.notes);
    else {
      if (!input.blind || input.kind === "table") values.push(row.quantity === null ? "" : row.quantity);
      if (input.kind === "sheet") values.push("");
      values.push(row.notes);
    }
    sheet.addRow(values);
  });
  sheet.getRow(3).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: `${input.type}-${input.kind}-${stamp}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
