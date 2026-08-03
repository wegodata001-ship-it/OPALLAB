import type { Content, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import { LAB_INFO, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { formatDate, formatTime } from "@/lib/utils";
import { googleMapsUrl } from "@/lib/geocode";
import { ANOMALY_LABELS } from "@/lib/attendance/management/status";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";
import { ensureAttendancePdfFonts, loadLogoDataUrl } from "@/lib/attendance/pdf/fonts";
import { computeAttendanceReportKpis } from "@/lib/attendance/pdf/metrics";
import {
  loadAttendancePhotoThumbs,
  recordsHavePhotos,
  type AttendancePhotoThumbs,
} from "@/lib/attendance/pdf/photos";
import { ltrText, rtlText, visualText } from "@/lib/attendance/pdf/rtl";

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

function gpsCell(
  lat?: number | null,
  lng?: number | null,
  address?: string | null,
): TableCell {
  if (lat == null || lng == null) {
    return rtlText("—", { fontSize: 7 });
  }
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const link = googleMapsUrl(lat, lng);
  const lines: Content[] = [
    { ...ltrText(coords, { fontSize: 6.5, link }), alignment: "right" },
  ];
  if (address?.trim()) {
    lines.push(rtlText(address.trim(), { fontSize: 6.5 }));
  }
  lines.push(rtlText("Google Maps", { fontSize: 6, link, color: "#0369a1" }));
  return { stack: lines, margin: [0, 1, 0, 1] };
}

function photoCell(dataUrl?: string): TableCell {
  if (!dataUrl) return rtlText("—", { fontSize: 7 });
  return { image: dataUrl, width: 28, height: 28, alignment: "center" };
}

function cell(text: string, fontSize = 7.5): TableCell {
  if (!text || text === "—") return rtlText("—", { fontSize });
  if (/^[\d./:\-\s,*]+$/.test(text) || /^[A-Za-z0-9@._+\-]+$/.test(text)) {
    return { ...ltrText(text, { fontSize }), alignment: "right" };
  }
  return rtlText(text, { fontSize });
}

function headerCell(text: string): TableCell {
  return {
    ...rtlText(text, { bold: true, fontSize: 7.5 }),
    fillColor: "#f5ecd3",
    margin: [2, 3, 2, 3],
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
  if (showEmployee) headers.push(headerCell("עובד"));
  headers.push(
    headerCell("תאריך"),
    headerCell("יום"),
    headerCell("כניסה"),
    headerCell("יציאה"),
    headerCell("שעות"),
    headerCell("סטטוס"),
    headerCell("GPS כניסה"),
    headerCell("GPS יציאה"),
    headerCell("כתובת"),
  );
  if (showPhotos) {
    headers.push(headerCell("תמונת כניסה"), headerCell("תמונת יציאה"));
  }

  const body: TableCell[][] = [headers];

  for (const r of records) {
    const address =
      r.checkInAddress?.trim() ||
      r.checkOutAddress?.trim() ||
      "";
    const row: TableCell[] = [];
    if (showEmployee) {
      row.push(
        cell(
          `${r.employee.name}\n${USER_ROLE_LABELS[r.employee.role] ?? ""}`,
          7,
        ),
      );
    }
    row.push(
      cell(formatDate(r.checkIn), 7.5),
      cell(weekdayHe(r.checkIn), 7),
      cell(formatTime(r.checkIn), 7.5),
      cell(r.checkOut ? formatTime(r.checkOut) : "—", 7.5),
      cell(durationLabel(r), 7.5),
      cell(statusLabel(r), 6.5),
      gpsCell(r.checkInLatitude, r.checkInLongitude, r.checkInAddress),
      gpsCell(r.checkOutLatitude, r.checkOutLongitude, r.checkOutAddress),
      cell(address || "—", 6.5),
    );
    if (showPhotos) {
      const t = thumbs.get(r.id);
      row.push(photoCell(t?.checkIn), photoCell(t?.checkOut));
    }
    body.push(row);
  }

  const colCount = headers.length;
  const widths = Array.from({ length: colCount }, () => "*");

  return {
    table: {
      headerRows: 1,
      widths,
      body,
      dontBreakRows: true,
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => "#d4d4d8",
      vLineColor: () => "#d4d4d8",
      paddingLeft: () => 3,
      paddingRight: () => 3,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    },
  };
}

function kpiBox(label: string, value: string): Content {
  return {
    stack: [
      rtlText(label, { fontSize: 7, color: "#64748b" }),
      {
        text: value,
        font: "NotoSans",
        fontSize: 12,
        bold: true,
        alignment: "right",
        margin: [0, 2, 0, 0],
      },
    ],
    margin: [4, 4, 4, 4],
  };
}

export async function buildAttendancePdf(opts: {
  records: AttendanceManagementRecord[];
  meta: AttendancePdfMeta;
}): Promise<{ buffer: Buffer; filename: string; contentType: "application/pdf" }> {
  const pdfmake = ensureAttendancePdfFonts();

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

  const headerStack: Content[] = [
    {
      columns: [
        {
          width: "*",
          stack: [
            {
              text: "OPAL LAB – Attendance Report",
              font: "NotoSans",
              bold: true,
              fontSize: 14,
              alignment: "right",
              color: "#a8861f",
            },
            rtlText(LAB_INFO.fullName, { fontSize: 9, color: "#475569" }),
            rtlText(LAB_INFO.subtitle, { fontSize: 8, color: "#64748b" }),
          ],
        },
        ...(logo
          ? [{ width: 42, image: logo, fit: [40, 40] as [number, number], alignment: "left" as const }]
          : []),
      ],
      columnGap: 10,
      margin: [0, 0, 0, 8],
    },
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: 760, y2: 0, lineWidth: 1.2, lineColor: "#c9a227" }],
      margin: [0, 0, 0, 10],
    },
    {
      columns: [
        rtlText(`תאריך הפקה: ${createdLabel}`, { fontSize: 8 }),
        rtlText(`מפיק הדוח: ${opts.meta.generatedByName}`, { fontSize: 8 }),
        rtlText(`טווח תאריכים: ${rangeLabel}`, { fontSize: 8 }),
        ...(opts.meta.employeeName
          ? [rtlText(`עובד: ${opts.meta.employeeName}`, { fontSize: 8 })]
          : [rtlText(opts.meta.mode === "general" ? "דוח כללי" : "דוח אישי", { fontSize: 8 })]),
      ],
      columnGap: 8,
      margin: [0, 0, 0, 10],
    },
    rtlText("סיכום", { bold: true, fontSize: 11 }),
    {
      columns: [
        kpiBox("סך שעות עבודה", String(kpis.totalHours)),
        kpiBox("מספר כניסות", String(kpis.checkIns)),
        kpiBox("מספר יציאות", String(kpis.checkOuts)),
        kpiBox("שעות נוספות", String(kpis.overtimeHours)),
        kpiBox("איחורים", String(kpis.lateCount)),
        kpiBox("ימים שעבד", String(kpis.workDays)),
        kpiBox(
          "ימים חסרים",
          kpis.missingDays == null ? "—" : String(kpis.missingDays),
        ),
      ],
      margin: [0, 4, 0, 12],
    },
    rtlText("טבלת נוכחות", { bold: true, fontSize: 11 }),
    { text: " ", margin: [0, 2, 0, 0] },
    buildTable(opts.records, opts.meta, thumbs, showPhotos),
  ];

  const docDefinition: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [28, 48, 28, 36],
    defaultStyle: {
      font: "NotoHebrew",
      fontSize: 8,
      alignment: "right",
    },
    info: {
      title: "OPAL LAB – Attendance Report",
      author: opts.meta.generatedByName,
      creator: "OPAL LAB",
    },
    header: () => ({
      margin: [28, 14, 28, 0],
      columns: [
        {
          text: visualText("דוח נוכחות"),
          font: "NotoHebrew",
          fontSize: 8,
          color: "#64748b",
          alignment: "right",
        },
        {
          text: "OPAL LAB",
          font: "NotoSans",
          fontSize: 8,
          bold: true,
          color: "#a8861f",
          alignment: "left",
        },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [28, 0, 28, 16],
      columns: [
        {
          text: visualText("OPAL LAB"),
          font: "NotoHebrew",
          fontSize: 7,
          color: "#94a3b8",
          alignment: "right",
        },
        {
          text: `${currentPage} / ${pageCount}`,
          font: "NotoSans",
          fontSize: 7,
          color: "#94a3b8",
          alignment: "center",
        },
        {
          text: createdLabel,
          font: "NotoSans",
          fontSize: 7,
          color: "#94a3b8",
          alignment: "left",
        },
      ],
    }),
    content: headerStack,
  };

  const buffer = (await pdfmake.createPdf(docDefinition).getBuffer()) as Buffer;
  return {
    buffer,
    filename: stampFilename(opts.meta.generatedAt),
    contentType: "application/pdf",
  };
}
