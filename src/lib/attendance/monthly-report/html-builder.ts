import { LAB_INFO } from "@/lib/constants/labels";
import { formatDate } from "@/lib/utils";
import type { MonthlyHoursReportData } from "@/lib/attendance/management/monthly-hours-report";
import { formatHoursMinutes } from "@/lib/attendance/management/monthly-summary";
import { buildEmbeddedFontCss, loadLogoDataUrl } from "@/lib/attendance/pdf-v2/fonts";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportStyles(): string {
  return `
${buildEmbeddedFontCss()}
:root {
  --ink: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --gold: #b8860b;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  color: var(--ink);
  font-size: 10pt;
  direction: rtl;
  font-family: "Noto Sans Hebrew", Arial, sans-serif;
}
.font-he { font-family: "Noto Sans Hebrew", Arial, sans-serif; }
.font-en { font-family: Inter, Arial, sans-serif; direction: ltr; unicode-bidi: embed; }

header.report-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--gold);
}
.brand { display: flex; gap: 10px; align-items: center; }
.brand img { height: 42px; width: auto; }
.brand h1 { margin: 0; font-size: 14pt; color: var(--gold); }
.brand p { margin: 2px 0 0; font-size: 9pt; color: var(--muted); }

.doc-title { text-align: center; flex: 1; }
.doc-title h2 { margin: 0; font-size: 16pt; }
.doc-title p { margin: 4px 0 0; color: var(--muted); font-size: 9pt; }

.meta-block { text-align: left; direction: rtl; font-size: 9pt; line-height: 1.5; }
.meta-block div { margin-bottom: 2px; }

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}
.summary-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  background: #f8fafc;
}
.summary-card .label { font-size: 8pt; color: var(--muted); margin-bottom: 2px; }
.summary-card .value { font-size: 11pt; font-weight: 700; }

table.hours-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
table.hours-table thead {
  display: table-header-group;
}
table.hours-table th {
  background: #f1f5f9;
  border: 1px solid var(--border);
  padding: 6px 8px;
  font-weight: 700;
  text-align: right;
}
table.hours-table td {
  border: 1px solid var(--border);
  padding: 5px 8px;
  vertical-align: middle;
}
table.hours-table td.ltr { direction: ltr; text-align: center; font-family: Inter, monospace; }
table.hours-table tr:nth-child(even) td { background: #fafafa; }
.empty { color: var(--muted); }

.footer-totals {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8fafc;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  page-break-inside: avoid;
}
.footer-totals .item .label { font-size: 8pt; color: var(--muted); }
.footer-totals .item .value { font-size: 11pt; font-weight: 700; }
`;
}

function buildTableBody(data: MonthlyHoursReportData): string {
  if (!data.rows.length) {
    return `<tr><td colspan="7" class="empty font-he">אין נתונים לחודש זה</td></tr>`;
  }
  return data.rows
    .map(
      (row) => `<tr>
  <td class="ltr">${esc(row.dateDisplay)}</td>
  <td class="font-he">${esc(row.weekday)}</td>
  <td class="ltr">${esc(row.checkIn)}</td>
  <td class="ltr">${esc(row.checkOut)}</td>
  <td class="ltr">${esc(row.workHours)}</td>
  <td class="ltr">${esc(row.overtimeHours)}</td>
  <td class="font-he">${esc(row.status)}</td>
</tr>`,
    )
    .join("");
}

export function buildMonthlyHoursReportHtml(data: MonthlyHoursReportData): string {
  const logo = loadLogoDataUrl();
  const generatedLabel = formatDate(data.generatedAt);
  const { summary } = data;

  const summaryCards = [
    ["ימי עבודה", String(summary.workDays)],
    ['סה"כ שעות עבודה', formatHoursMinutes(summary.totalHours)],
    ['סה"כ שעות נוספות', formatHoursMinutes(summary.overtimeHours)],
    ["איחורים", String(summary.lateCount)],
    ["יציאות מוקדמות", String(summary.earlyLeaveCount)],
  ]
    .map(
      ([label, value]) =>
        `<div class="summary-card"><div class="label font-he">${esc(label)}</div><div class="value font-en">${esc(value)}</div></div>`,
    )
    .join("");

  const footerTotals = [
    ["סה״כ ימי עבודה", String(summary.workDays)],
    ['סה"כ שעות', formatHoursMinutes(summary.totalHours)],
    ['סה"כ שעות נוספות', formatHoursMinutes(summary.overtimeHours)],
  ]
    .map(
      ([label, value]) =>
        `<div class="item"><div class="label font-he">${esc(label)}</div><div class="value font-en">${esc(value)}</div></div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>דוח שעות חודשי — ${esc(data.employeeName)}</title>
  <style>${reportStyles()}</style>
</head>
<body>
  <header class="report-header">
    <div class="brand">
      ${logo ? `<img src="${logo}" alt="OPAL LAB" />` : ""}
      <div>
        <h1 class="font-en">OPAL LAB</h1>
        <p class="font-he">${esc(LAB_INFO.subtitle)}</p>
      </div>
    </div>
    <div class="doc-title">
      <h2 class="font-he">דוח שעות חודשי</h2>
      <p class="font-en">Monthly Hours Report</p>
    </div>
    <div class="meta-block">
      <div class="font-he"><strong>שם העובד:</strong> ${esc(data.employeeName)}</div>
      <div class="font-he"><strong>חודש:</strong> ${esc(data.monthLabel)}</div>
      <div class="font-he"><strong>תאריך הפקת הדוח:</strong> ${esc(generatedLabel)}</div>
    </div>
  </header>

  <section>
    <div class="summary-grid">${summaryCards}</div>
  </section>

  <section>
    <table class="hours-table">
      <thead>
        <tr>
          <th class="font-he">תאריך</th>
          <th class="font-he">יום</th>
          <th class="font-he">שעת כניסה</th>
          <th class="font-he">שעת יציאה</th>
          <th class="font-he">שעות עבודה</th>
          <th class="font-he">שעות נוספות</th>
          <th class="font-he">סטטוס</th>
        </tr>
      </thead>
      <tbody>${buildTableBody(data)}</tbody>
    </table>
  </section>

  <footer class="footer-totals">${footerTotals}</footer>
</body>
</html>`;
}
