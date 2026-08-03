import type { Content, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import { LAB_INFO, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { formatDate, formatTime } from "@/lib/utils";
import { googleMapsUrl } from "@/lib/geocode";
import { ANOMALY_LABELS } from "@/lib/attendance/management/status";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";
import {
  autoText,
  createPdfBuffer,
  loadLogoDataUrl,
  ltrText,
  PDF_DEFAULT_FONT,
  rtlText,
  visualText,
} from "@/lib/pdf";
import { computeAttendanceReportKpis } from "@/lib/attendance/pdf/metrics";
import {
  loadAttendancePhotoThumbs,
  recordsHavePhotos,
  type AttendancePhotoThumbs,
} from "@/lib/attendance/pdf/photos";

export type AttendancePdfMeta = {
  generatedAt: Date;
  generatedByName: string;
  employeeName?: string | null;
  dateFrom?: string;
  dateTo?: string;
  includePhotos?: boolean;
  mode: "personal" | "general";
};

function stampFilename(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `attendance-${y}-${m}-${day}.pdf`;
}

function weekdayHe(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

function complianceLabel(r: AttendanceManagementRecord): string {
  if (r.complianceStatus === "ok") return "תקין";
  if (r.complianceStatus === "missing") return "חסר";
  return "חריג";
}

function statusLabel(r: AttendanceManagementRecord): string {
  const parts = [complianceLabel(r)];
  if (r.isLate) parts.push("איחור");
  if (r.isOvertime) parts.push("נוספות");
  if (!r.checkOut) parts.push("פתוחה");
  const anomalies = r.anomalies
    .filter((a) => a !== "late")
    .map((a) => ANOMALY_LABELS[a])
    .filter(Boolean);
  if (anomalies.length) parts.push(anomalies.slice(0, 2).join(", "));
  return parts.join(" · ");
}

function durationLabel(r: AttendanceManagementRecord): string {
  if (r.durationHours != null) return r.durationHours.toFixed(2);
  if (!r.checkOut) {
    const h = (Date.now() - r.checkIn.getTime()) / 3_600_000;
    return `${h.toFixed(2)}*`;
  }
  return "—";
}

/** Short GPS cell — no long Maps URLs inside the table. */
function gpsCell(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
): TableCell {
  if (lat == null || lng == null) {
    return autoText("—", { fontSize: 8 });
  }
  const link = googleMapsUrl(lat, lng);
  const lines: Content[] = [
    rtlText("הצג מיקום", { fontSize: 8, link, color: "#0369a1" }),
  ];
  if (address?.trim()) {
    lines.push(autoText(address.trim(), { fontSize: 7, color: "#64748b" }));
  } else {
    lines.push(
      ltrText(`${lat.toFixed(4)}, ${lng.toFixed(4)}`, { fontSize: 7, color: "#94a3b8" }),
    );
  }
  return { stack: lines, margin: [1, 2, 1, 2] };
}

function headerCell(text: string): TableCell {
  return {
    ...rtlText(text, { bold: true, fontSize: 9 }),
    fillColor: "#f5ecd3",
    margin: [4, 5, 4, 5],
  };
}

function buildTable(
  records: AttendanceManagementRecord[],
  meta: AttendancePdfMeta,
  thumbs: AttendancePhotoThumbs,
  showPhotos: boolean,
): Content {
  const showEmployee = meta.mode === "general";
  const headers: TableCell[] = [];
  if (showEmployee) headers.push(headerCell("שם עובד"));
  headers.push(
    headerCell("תאריך"),
    headerCell("יום"),
    headerCell("כניסה"),
    headerCell("יציאה"),
    headerCell("שעות"),
    headerCell("סטטוס"),
    headerCell("GPS"),
  );
  if (showPhotos) {
    headers.push(headerCell("תמונות"));
  }

  const body: TableCell[][] = [headers];

  for (const r of records) {
    const row: TableCell[] = [];
    if (showEmployee) {
      row.push(
        {
          stack: [
            autoText(r.employee.name, { fontSize: 9, bold: true }),
            autoText(USER_ROLE_LABELS[r.employee.role] ?? "", { fontSize: 7, color: "#64748b" }),
          ],
          margin: [2, 2, 2, 2],
        },
      );
    }
    row.push(
      autoText(formatDate(r.checkIn), { fontSize: 9 }),
      autoText(weekdayHe(r.checkIn), { fontSize: 8 }),
      autoText(formatTime(r.checkIn), { fontSize: 9 }),
      autoText(r.checkOut ? formatTime(r.checkOut) : "—", { fontSize: 9 }),
      autoText(durationLabel(r), { fontSize: 9 }),
      autoText(statusLabel(r), { fontSize: 8 }),
      gpsCell(
        r.checkInLatitude ?? r.checkOutLatitude,
        r.checkInLongitude ?? r.checkOutLongitude,
        r.checkInAddress ?? r.checkOutAddress,
      ),
    );
    if (showPhotos) {
      const t = thumbs.get(r.id);
      const cols: Array<{ width: number; image: string; height: number }> = [];
      if (t?.checkIn) cols.push({ width: 30, image: t.checkIn, height: 28 });
      if (t?.checkOut) cols.push({ width: 30, image: t.checkOut, height: 28 });
      row.push(
        cols.length
          ? { columns: cols, columnGap: 4 }
          : autoText("—", { fontSize: 8 }),
      );
    }
    body.push(row);
  }

  const widths = showEmployee
    ? showPhotos
      ? [70, 55, 35, 40, 40, 40, "*", 55, 64]
      : [80, 60, 40, 45, 45, 45, "*", 60]
    : showPhotos
      ? [55, 40, 45, 45, 45, "*", 60, 64]
      : [60, 45, 50, 50, 50, "*", 70];

  return {
    table: {
      headerRows: 1,
      widths,
      body,
      dontBreakRows: true,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#d4d4d8",
      vLineColor: () => "#d4d4d8",
      paddingLeft: () => 5,
      paddingRight: () => 5,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}

function kpiBox(label: string, value: string): Content {
  return {
    stack: [
      rtlText(label, { fontSize: 8, color: "#64748b" }),
      {
        ...ltrText(value, { bold: true, fontSize: 13 }),
        margin: [0, 3, 0, 0],
      },
    ],
    margin: [6, 6, 6, 6],
  };
}

export async function buildAttendancePdf(opts: {
  records: AttendanceManagementRecord[];
  meta: AttendancePdfMeta;
}): Promise<{ buffer: Buffer; filename: string; contentType: "application/pdf" }> {
  const includePhotos = opts.meta.includePhotos !== false;
  const showPhotos = includePhotos && recordsHavePhotos(opts.records);
  const thumbs = await loadAttendancePhotoThumbs(opts.records, showPhotos);
  const logo = loadLogoDataUrl();
  const kpis = computeAttendanceReportKpis(opts.records, {
    from: opts.meta.dateFrom,
    to: opts.meta.dateTo,
    personal: opts.meta.mode === "personal",
  });

  const createdLabel = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "short",
    timeStyle: "short",
  }).format(opts.meta.generatedAt);

  const rangeLabel =
    opts.meta.dateFrom && opts.meta.dateTo
      ? `${opts.meta.dateFrom} – ${opts.meta.dateTo}`
      : "הכל";

  const content: Content[] = [
    {
      columns: [
        {
          width: "*",
          stack: [
            rtlText("OPAL LAB – Attendance Report", {
              bold: true,
              fontSize: 16,
              color: "#a8861f",
            }),
            rtlText(LAB_INFO.fullName, { fontSize: 10, color: "#475569" }),
            rtlText(LAB_INFO.subtitle, { fontSize: 9, color: "#64748b" }),
          ],
        },
        ...(logo
          ? [{ width: 44, image: logo, fit: [42, 42] as [number, number], alignment: "left" as const }]
          : []),
      ],
      columnGap: 12,
      margin: [0, 0, 0, 10],
    },
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: 780, y2: 0, lineWidth: 1.4, lineColor: "#c9a227" }],
      margin: [0, 0, 0, 12],
    },
    {
      columns: [
        rtlText(`תאריך הפקה: ${createdLabel}`, { fontSize: 9 }),
        rtlText(`מפיק הדוח: ${opts.meta.generatedByName}`, { fontSize: 9 }),
        rtlText(`טווח תאריכים: ${rangeLabel}`, { fontSize: 9 }),
        ...(opts.meta.employeeName
          ? [rtlText(`עובד: ${opts.meta.employeeName}`, { fontSize: 9 })]
          : [rtlText(opts.meta.mode === "general" ? "דוח כללי" : "דוח אישי", { fontSize: 9 })]),
      ],
      columnGap: 10,
      margin: [0, 0, 0, 12],
    },
    rtlText("סיכום", { bold: true, fontSize: 12 }),
    {
      columns: [
        kpiBox("סך שעות עבודה", String(kpis.totalHours)),
        kpiBox("מספר כניסות", String(kpis.checkIns)),
        kpiBox("מספר יציאות", String(kpis.checkOuts)),
        kpiBox("שעות נוספות", String(kpis.overtimeHours)),
        kpiBox("איחורים", String(kpis.lateCount)),
        kpiBox("ימים שעבד", String(kpis.workDays)),
        kpiBox("ימים חסרים", kpis.missingDays == null ? "—" : String(kpis.missingDays)),
      ],
      margin: [0, 6, 0, 14],
    },
    rtlText("טבלת נוכחות", { bold: true, fontSize: 12 }),
    { text: " ", margin: [0, 4, 0, 0] },
    buildTable(opts.records, opts.meta, thumbs, showPhotos),
  ];

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 50, 28, 40],
    defaultStyle: {
      font: PDF_DEFAULT_FONT,
      fontSize: 9,
      alignment: "right",
    },
    info: {
      title: "OPAL LAB – Attendance Report",
      author: opts.meta.generatedByName,
      creator: "OPAL LAB",
    },
    header: () => ({
      margin: [28, 16, 28, 0],
      columns: [
        {
          text: visualText("דוח נוכחות"),
          font: PDF_DEFAULT_FONT,
          fontSize: 9,
          color: "#64748b",
          alignment: "right",
        },
        {
          text: "OPAL LAB",
          font: PDF_DEFAULT_FONT,
          fontSize: 9,
          bold: true,
          color: "#a8861f",
          alignment: "left",
        },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [28, 0, 28, 18],
      columns: [
        {
          text: visualText("OPAL LAB"),
          font: PDF_DEFAULT_FONT,
          fontSize: 8,
          color: "#94a3b8",
          alignment: "right",
        },
        {
          text: `${currentPage} / ${pageCount}`,
          font: PDF_DEFAULT_FONT,
          fontSize: 8,
          color: "#94a3b8",
          alignment: "center",
        },
        {
          text: createdLabel,
          font: PDF_DEFAULT_FONT,
          fontSize: 8,
          color: "#94a3b8",
          alignment: "left",
        },
      ],
    }),
    content,
  };

  const buffer = await createPdfBuffer(docDefinition);
  return {
    buffer,
    filename: stampFilename(opts.meta.generatedAt),
    contentType: "application/pdf",
  };
}
