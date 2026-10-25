import ExcelJS from "exceljs";
import type { InventoryModuleType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { buildEmbeddedFontCss, loadLogoDataUrl } from "@/lib/attendance/pdf-v2/fonts";
import { htmlToPdfBuffer } from "@/lib/attendance/pdf-v2/render-pdf";
import { listCountableItems } from "@/lib/inventory/inventory-count-items";
import {
  REMINDER_MODULE_LABELS,
  REMINDER_MODULES,
  dateKey,
  shouldAlertLow,
  shouldAlertZero,
  taskStatusLabel,
  type CountTaskState,
} from "@/lib/inventory/inventory-reminder-rules";

export const REMINDER_REPORT_KINDS = ["missed", "overdue", "low", "zero", "history", "variance"] as const;
export type ReminderReportKind = (typeof REMINDER_REPORT_KINDS)[number];

const TITLES: Record<ReminderReportKind, string> = {
  missed: "ספירות שלא בוצעו",
  overdue: "ספירות באיחור",
  low: "מלאי חסר",
  zero: "מלאי אפס",
  history: "היסטוריית ספירות",
  variance: "הפרשי מלאי",
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function parseReminderReportKind(value: string | null): ReminderReportKind {
  if (value && REMINDER_REPORT_KINDS.includes(value as ReminderReportKind)) return value as ReminderReportKind;
  throw new AppError("VALIDATION_ERROR", "סוג דוח לא תקין", 400);
}

async function stockRows(kind: "low" | "zero") {
  const rows: string[][] = [];
  for (const type of REMINDER_MODULES) {
    const [items, thresholds] = await Promise.all([
      listCountableItems(type),
      prisma.inventoryStockThreshold.findMany({ where: { inventoryType: type, alertsEnabled: true } }),
    ]);
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const threshold of thresholds) {
      const item = byId.get(threshold.itemId);
      if (!item) continue;
      const show = kind === "zero"
        ? shouldAlertZero({ alertsEnabled: true, quantity: item.quantity })
        : shouldAlertLow({ alertsEnabled: true, minQuantity: threshold.minQuantity, quantity: item.quantity });
      if (!show) continue;
      rows.push([
        REMINDER_MODULE_LABELS[type],
        item.name,
        item.quantity === null ? "—" : String(item.quantity),
        threshold.minQuantity === null ? "—" : String(threshold.minQuantity),
        threshold.targetQuantity === null ? "—" : String(threshold.targetQuantity),
        kind === "zero" ? "קריטי" : "חוסר",
      ]);
    }
  }
  return rows;
}

export async function reminderReportTable(kind: ReminderReportKind, now = new Date()) {
  const title = TITLES[kind];
  const printedAt = now.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
  if (kind === "low" || kind === "zero") {
    return { title, printedAt, headers: ["קטגוריה", "פריט", "כמות", "מינימום", "רצוי", "סטטוס"], rows: await stockRows(kind) };
  }
  const tasks = await prisma.inventoryCountTask.findMany({
    include: { count: { include: { lines: true, createdBy: { select: { name: true } } } }, assignedTo: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  });
  if (kind === "variance") {
    const rows: string[][] = [];
    for (const task of tasks) {
      for (const line of task.count?.lines ?? []) {
        if (line.countedQuantity === null || line.difference === 0) continue;
        const difference = line.difference ?? line.countedQuantity - (line.quantityAtStart ?? 0);
        if (difference === 0) continue;
        rows.push([
          REMINDER_MODULE_LABELS[task.inventoryType],
          task.periodKey,
          line.name,
          line.quantityAtStart === null ? "—" : String(line.quantityAtStart),
          String(line.countedQuantity),
          String(difference),
          taskStatusLabel(task.status as CountTaskState),
        ]);
      }
    }
    return { title, printedAt, headers: ["קטגוריה", "תקופה", "פריט", "במערכת", "בפועל", "הפרש", "סטטוס"], rows };
  }
  const filtered = tasks.filter((task) => {
    if (kind === "history") return true;
    if (task.status === "COMPLETED") return false;
    if (kind === "overdue") return task.overdueDays > 0 || task.status === "OVERDUE";
    return dateKey(task.dueDate) <= dateKey(now);
  });
  return {
    title,
    printedAt,
    headers: ["קטגוריה", "תקופה", "מועד", "סטטוס", "ימי איחור", "מבצע", "משויך"],
    rows: filtered.map((task) => [
      REMINDER_MODULE_LABELS[task.inventoryType as InventoryModuleType],
      task.periodKey,
      dateKey(task.dueDate),
      taskStatusLabel(task.status as CountTaskState),
      String(task.overdueDays),
      task.count?.createdBy.name ?? "—",
      task.assignedTo?.name ?? "—",
    ]),
  };
}

export async function renderReminderWorkbook(kind: ReminderReportKind) {
  const table = await reminderReportTable(kind);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OPAL LAB";
  const sheet = workbook.addWorksheet(table.title, { views: [{ rightToLeft: true }] });
  sheet.addRow(["OPAL LAB", table.title, table.printedAt]);
  sheet.addRow(table.headers);
  for (const row of table.rows) sheet.addRow(row);
  if (table.rows.length === 0) sheet.addRow(["אין נתונים"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function renderReminderPdf(kind: ReminderReportKind) {
  const table = await reminderReportTable(kind);
  const logo = loadLogoDataUrl();
  const head = table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = table.rows.length === 0
    ? `<tr><td colspan="${table.headers.length}">אין נתונים</td></tr>`
    : table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${buildEmbeddedFontCss()} body{font-family:"Noto Sans Hebrew",sans-serif;color:#0f172a} table{width:100%;border-collapse:collapse} th,td{border:1px solid #e2e8f0;padding:6px;text-align:right;font-size:12px} th{background:#0f172a;color:#fff} h1{font-size:20px;margin:0} .meta{color:#64748b;font-size:12px}</style></head><body><header>${logo ? `<img src="${logo}" alt="OPAL LAB" width="42" height="42">` : ""}<h1>OPAL LAB</h1><p>${escapeHtml(table.title)}</p><p class="meta">${escapeHtml(table.printedAt)}</p></header><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  return htmlToPdfBuffer(html, { landscape: true, footerLabel: table.title });
}
