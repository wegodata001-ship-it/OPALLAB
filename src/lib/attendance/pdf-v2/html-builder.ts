import { LAB_INFO, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { formatDate, formatTime } from "@/lib/utils";
import { ANOMALY_LABELS } from "@/lib/attendance/management/status";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";
import { computeAttendanceReportKpis } from "@/lib/attendance/pdf/metrics";
import {
  formatDurationFromHours,
  formatMinutesHHmm,
  getAttendanceStatus,
  lateMinutesFromCheckIn,
} from "@/lib/attendance/management/attendance-status";
import { buildEmbeddedFontCss, loadLogoDataUrl } from "@/lib/attendance/pdf-v2/fonts";
import { gpsLocationHtml } from "@/lib/attendance/pdf-v2/gps-label";
import type { AttendanceReportMeta } from "@/lib/attendance/pdf-v2/types";

const STANDARD_DAILY_HOURS = 9;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function weekdayHe(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

function jerusalemParts(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
    minute: Number(parts.find((p) => p.type === "minute")?.value ?? 0),
  };
}

function lateLabel(r: AttendanceManagementRecord): string {
  if (!r.isLate) return "—";
  const mins = lateMinutesFromCheckIn(r.checkIn);
  if (mins == null || mins <= 0) return "—";
  return formatMinutesHHmm(mins);
}

function overtimeHours(r: AttendanceManagementRecord): string {
  if (!r.isOvertime || r.durationHours == null) return "—";
  const otMin = Math.max(0, Math.round(r.durationHours * 60) - 9 * 60);
  return otMin > 0 ? formatMinutesHHmm(otMin) : "—";
}

function durationLabel(r: AttendanceManagementRecord): string {
  if (r.durationHours != null) return formatDurationFromHours(r.durationHours);
  if (!r.checkOut) return "פתוח";
  return "—";
}

function statusLabel(r: AttendanceManagementRecord): string {
  return getAttendanceStatus(r).label;
}

function pickFontClass(text: string): string {
  if (/[\u0600-\u06FF]/.test(text)) return "font-ar";
  if (/[\u0590-\u05FF]/.test(text)) return "font-he";
  return "font-en";
}

function cell(text: string, cls = ""): string {
  return `<td class="${pickFontClass(text)} ${cls}">${esc(text)}</td>`;
}

function buildSummaryCards(kpis: ReturnType<typeof computeAttendanceReportKpis>): string {
  const items = [
    ["סה״כ ימים", String(kpis.workDays)],
    ["סה״כ שעות", String(kpis.totalHours)],
    ["שעות נוספות", String(kpis.overtimeHours)],
    ["איחורים", String(kpis.lateCount)],
    ["יציאות מוקדמות", String(kpis.earlyLeaveCount)],
    ["כניסות", String(kpis.checkIns)],
    ["יציאות", String(kpis.checkOuts)],
    ["ימי עבודה", String(kpis.workDays)],
  ];
  if (kpis.missingDays != null) {
    items.push(["ימים חסרים", String(kpis.missingDays)]);
  }
  return items
    .map(
      ([label, value]) =>
        `<div class="kpi-card"><div class="kpi-label font-he">${esc(label)}</div><div class="kpi-value font-en">${esc(value)}</div></div>`,
    )
    .join("");
}

function buildTableRows(
  records: AttendanceManagementRecord[],
  showEmployee: boolean,
): string {
  if (!records.length) {
    const cols = showEmployee ? 11 : 10;
    return `<tr><td colspan="${cols}" class="empty-row font-he">אין רשומות בטווח שנבחר</td></tr>`;
  }

  return records
    .map((r) => {
      const cols: string[] = [];
      if (showEmployee) {
        cols.push(
          `<td class="${pickFontClass(r.employee.name)}"><strong>${esc(r.employee.name)}</strong><br/><span class="muted">${esc(USER_ROLE_LABELS[r.employee.role] ?? "")}</span></td>`,
        );
      }
      cols.push(
        cell(formatDate(r.checkIn)),
        cell(weekdayHe(r.checkIn)),
        `<td class="font-en ltr">${esc(formatTime(r.checkIn))}</td>`,
        `<td class="font-en ltr">${esc(r.checkOut ? formatTime(r.checkOut) : "—")}</td>`,
        `<td class="font-en ltr">${esc(durationLabel(r))}</td>`,
        `<td class="font-en ltr">${esc(overtimeHours(r))}</td>`,
        cell(lateLabel(r)),
        cell(statusLabel(r)),
        `<td>${gpsLocationHtml(r.checkInAddressCity, r.checkInAddress, r.checkInLatitude, r.checkInLongitude)}</td>`,
        `<td>${gpsLocationHtml(r.checkOutAddressCity, r.checkOutAddress, r.checkOutLatitude, r.checkOutLongitude)}</td>`,
      );
      return `<tr class="data-row">${cols.join("")}</tr>`;
    })
    .join("");
}

function methodBadges(r: AttendanceManagementRecord): string {
  const badges: string[] = [];
  const m = r.method;
  if (m === "NFC" || r.nfcTagId) badges.push("NFC");
  if (m === "TRUSTED_DEVICE") badges.push("QR");
  if (m === "GPS") badges.push("GPS");
  if (m === "MANUAL") badges.push("ידני");
  if (!badges.length) badges.push(r.channelLabel);
  return badges.map((b) => `<span class="badge">${esc(b)}</span>`).join(" ");
}

function buildAuditSection(records: AttendanceManagementRecord[]): string {
  if (!records.length) {
    return `<p class="font-he muted">אין רשומות Audit.</p>`;
  }

  return records
    .map((r) => {
      const device = [
        r.checkInDeviceType ?? r.deviceInfo,
        r.checkInDeviceOs,
        r.checkInDeviceBrowser,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
<article class="audit-card">
  <header class="audit-card-head">
    <span class="${pickFontClass(r.employee.name)}"><strong>${esc(r.employee.name)}</strong> · ${esc(formatDate(r.checkIn))}</span>
    <span class="font-en ltr muted">${esc(formatTime(r.checkIn))}${r.checkOut ? ` – ${esc(formatTime(r.checkOut))}` : ""}</span>
  </header>
  <dl class="audit-dl">
    <div><dt class="font-he">מכשיר</dt><dd class="${pickFontClass(device)}">${esc(device || "—")}</dd></div>
    <div><dt class="font-he">מערכת הפעלה</dt><dd class="font-en">${esc(r.checkInDeviceOs ?? "—")}</dd></div>
    <div><dt class="font-he">דפדפן</dt><dd class="font-en">${esc(r.checkInDeviceBrowser ?? "—")}</dd></div>
    <div><dt class="font-he">IP</dt><dd class="font-en ltr">${esc(r.ipAddress ?? "—")}</dd></div>
    <div><dt class="font-he">GPS כניסה</dt><dd>${gpsLocationHtml(r.checkInAddressCity, r.checkInAddress, r.checkInLatitude, r.checkInLongitude)}</dd></div>
    <div><dt class="font-he">GPS יציאה</dt><dd>${gpsLocationHtml(r.checkOutAddressCity, r.checkOutAddress, r.checkOutLatitude, r.checkOutLongitude)}</dd></div>
    <div><dt class="font-he">שיטת כניסה</dt><dd>${methodBadges(r)}</dd></div>
    <div><dt class="font-he">NFC</dt><dd class="font-en ltr">${esc(r.nfcTagId ?? "—")}</dd></div>
    <div><dt class="font-he">QR</dt><dd class="font-he">${esc(r.method === "TRUSTED_DEVICE" ? "כן" : "—")}</dd></div>
    <div><dt class="font-he">GPS</dt><dd class="font-he">${esc(r.method === "GPS" || r.checkInLatitude != null ? "כן" : "—")}</dd></div>
  </dl>
  <div class="audit-photos">
    <span class="font-he audit-photos-empty">תמונות: אין תמונות זמינות לרשומה זו</span>
  </div>
</article>`;
    })
    .join("");
}

function reportStyles(): string {
  return `
${buildEmbeddedFontCss()}

:root {
  --gold: #b8922a;
  --gold-light: #f5ecd3;
  --ink: #1e293b;
  --muted: #64748b;
  --border: #e2e8f0;
  --bg: #ffffff;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  direction: rtl;
  text-align: right;
  font-family: "Noto Sans Hebrew", "Noto Sans Arabic", "Inter", sans-serif;
  font-size: 10pt;
  color: var(--ink);
  background: var(--bg);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

body { padding: 28mm 0 10mm; }

.font-he { font-family: "Noto Sans Hebrew", sans-serif; }
.font-ar { font-family: "Noto Sans Arabic", sans-serif; }
.font-en { font-family: "Inter", "Noto Sans Hebrew", sans-serif; }
.ltr { direction: ltr; unicode-bidi: isolate; text-align: left; }
.muted { color: var(--muted); font-size: 8.5pt; }

@page {
  size: A4 landscape;
  margin: 28mm 10mm 14mm 10mm;
}

.running-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0 8px;
  border-bottom: 2px solid var(--gold);
  background: white;
}

.running-header-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.running-header-brand img { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; }
.running-header-brand h1 { font-size: 13pt; font-weight: 700; color: var(--gold); line-height: 1.1; }
.running-header-brand p { font-size: 8pt; color: var(--muted); }

.running-header-center { text-align: center; flex: 1; min-width: 0; }
.running-header-center .title { font-size: 11pt; font-weight: 700; }
.running-header-center .subtitle { font-size: 8pt; color: var(--muted); margin-top: 2px; }

.running-header-meta {
  text-align: left;
  font-size: 7.5pt;
  color: var(--muted);
  line-height: 1.45;
  min-width: 140px;
}

.report-title { font-size: 14pt; font-weight: 700; margin-bottom: 12px; color: var(--ink); }

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.kpi-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  background: #fafafa;
}

.kpi-label { font-size: 8pt; color: var(--muted); margin-bottom: 4px; }
.kpi-value { font-size: 14pt; font-weight: 700; color: var(--gold); }

.section-title {
  font-size: 11pt;
  font-weight: 700;
  margin: 14px 0 8px;
  color: var(--ink);
}

table.attendance-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.5pt;
}

table.attendance-table thead { display: table-header-group; }
table.attendance-table tbody { display: table-row-group; }

table.attendance-table th {
  background: var(--gold-light);
  font-weight: 700;
  padding: 7px 6px;
  border: 1px solid var(--border);
  white-space: nowrap;
}

table.attendance-table td {
  padding: 6px;
  border: 1px solid var(--border);
  vertical-align: top;
}

table.attendance-table tr.data-row {
  page-break-inside: avoid;
  break-inside: avoid;
}

.empty-row { text-align: center; padding: 20px !important; color: var(--muted); }

.gps-cell { line-height: 1.35; }
.gps-cell .map-link {
  display: block;
  font-size: 7.5pt;
  color: #0369a1;
  text-decoration: none;
  margin-top: 2px;
}

.badge {
  display: inline-block;
  padding: 1px 6px;
  margin-left: 4px;
  border-radius: 4px;
  background: var(--gold-light);
  font-size: 8pt;
}

.page-break { page-break-before: always; break-before: page; }

.audit-section { margin-top: 8px; }
.audit-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.audit-card-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.audit-dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  font-size: 8.5pt;
}

.audit-dl dt { font-weight: 600; color: var(--muted); }
.audit-dl dd { margin: 0; }

.audit-photos { margin-top: 8px; font-size: 8pt; }
.audit-photos-empty { color: var(--muted); }

.content { padding: 0 2mm; }
`;
}

export function buildAttendanceReportHtml(opts: {
  records: AttendanceManagementRecord[];
  meta: AttendanceReportMeta;
}): string {
  const logo = loadLogoDataUrl();
  const kpis = computeAttendanceReportKpis(opts.records, {
    from: opts.meta.dateFrom,
    to: opts.meta.dateTo,
    personal: opts.meta.mode === "personal",
  });

  const createdLabel = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(opts.meta.generatedAt);

  const rangeLabel =
    opts.meta.dateFrom && opts.meta.dateTo
      ? `${opts.meta.dateFrom} – ${opts.meta.dateTo}`
      : "הכל";

  const title =
    opts.meta.mode === "personal" && opts.meta.employeeName
      ? `דוח נוכחות — ${opts.meta.employeeName}`
      : "דוח נוכחות כללי";

  const showEmployee = opts.meta.mode === "general";

  const theadCols = showEmployee ? `<th class="font-he">שם עובד</th>` : "";
  const thead = `
<thead><tr>
  ${theadCols}
  <th class="font-he">תאריך</th>
  <th class="font-he">יום</th>
  <th class="font-he">כניסה</th>
  <th class="font-he">יציאה</th>
  <th class="font-he">משך עבודה</th>
  <th class="font-he">שעות נוספות</th>
  <th class="font-he">איחור</th>
  <th class="font-he">סטטוס</th>
  <th class="font-he">GPS כניסה</th>
  <th class="font-he">GPS יציאה</th>
</tr></thead>`;

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} — OPAL LAB</title>
  <style>${reportStyles()}</style>
</head>
<body>
  <header class="running-header">
    <div class="running-header-brand">
      ${logo ? `<img src="${logo}" alt="OPAL LAB" />` : ""}
      <div>
        <h1 class="font-en">OPAL LAB</h1>
        <p class="font-he">${esc(LAB_INFO.fullName)}</p>
      </div>
    </div>
    <div class="running-header-center">
      <div class="title font-he">דוח נוכחות</div>
      <div class="subtitle font-en">Attendance Report</div>
    </div>
    <div class="running-header-meta">
      <div class="font-he">תאריך יצירה: ${esc(createdLabel)}</div>
      ${opts.meta.employeeName ? `<div class="font-he">שם העובד: ${esc(opts.meta.employeeName)}</div>` : ""}
      <div class="font-he">טווח: ${esc(rangeLabel)}</div>
      <div class="font-he">מפיק: ${esc(opts.meta.generatedByName)}</div>
    </div>
  </header>

  <main class="content">
    <h2 class="report-title font-he">${esc(title)}</h2>

    <section>
      <h3 class="section-title font-he">סיכום</h3>
      <div class="kpi-grid">${buildSummaryCards(kpis)}</div>
    </section>

    <section>
      <h3 class="section-title font-he">טבלת נוכחות</h3>
      <table class="attendance-table">
        ${thead}
        <tbody>${buildTableRows(opts.records, showEmployee)}</tbody>
      </table>
    </section>

    <section class="audit-section page-break">
      <h3 class="section-title font-he">Audit — פרטי מכשיר ואימות</h3>
      ${buildAuditSection(opts.records)}
    </section>
  </main>
</body>
</html>`;
}

export function stampFilename(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `attendance-${y}-${m}-${day}.pdf`;
}
