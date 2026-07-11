import { formatDate, formatTime } from "@/lib/utils";
import { USER_ROLE_LABELS, ATTENDANCE_METHOD_LABELS } from "@/lib/constants/labels";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";

function escapeCsv(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDuration(record: AttendanceManagementRecord): string {
  if (record.durationHours != null) return record.durationHours.toFixed(2);
  if (!record.checkOut) {
    const h = (Date.now() - record.checkIn.getTime()) / 3_600_000;
    return h.toFixed(2);
  }
  return "—";
}

export function buildAttendanceExport(
  records: AttendanceManagementRecord[],
  format: string,
): { body: string; contentType: string; filename: string } {
  const stamp = formatDate(new Date()).replace(/\//g, "-");

  if (format === "csv") {
    const headers = [
      "שם",
      "תפקיד",
      "טלפון",
      "תאריך",
      "כניסה",
      "יציאה",
      "משך (שעות)",
      "כתובת כניסה",
      "כתובת יציאה",
      "דיוק GPS",
      "דפדפן",
      "מערכת",
      "מכשיר",
      "שיטה",
      "תמונת כניסה",
      "תמונת יציאה",
    ];
    const lines = records.map((r) =>
      [
        r.employee.name,
        USER_ROLE_LABELS[r.employee.role],
        r.employee.phone ?? "",
        formatDate(r.checkIn),
        formatTime(r.checkIn),
        r.checkOut ? formatTime(r.checkOut) : "",
        formatDuration(r),
        r.checkInAddress ?? "",
        r.checkOutAddress ?? "",
        r.checkInAccuracy != null ? `${Math.round(r.checkInAccuracy)}m` : "",
        r.checkInDeviceBrowser ?? "",
        r.checkInDeviceOs ?? "",
        r.checkInDeviceType ?? "",
        ATTENDANCE_METHOD_LABELS[r.method] ?? r.method,
        r.checkInPhotoUrl ?? "",
        r.checkOutPhotoUrl ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
    const body = "\uFEFF" + [headers.join(","), ...lines].join("\n");
    return {
      body,
      contentType: "text/csv;charset=utf-8",
      filename: `attendance-${stamp}.csv`,
    };
  }

  const rows = records
    .map(
      (r) => `<tr>
      <td>${r.employee.name}</td>
      <td>${USER_ROLE_LABELS[r.employee.role]}</td>
      <td>${formatDate(r.checkIn)}</td>
      <td>${formatTime(r.checkIn)}</td>
      <td>${r.checkOut ? formatTime(r.checkOut) : "—"}</td>
      <td>${formatDuration(r)}</td>
      <td>${r.checkInAddress ?? "—"}</td>
      <td>${r.checkOutAddress ?? "—"}</td>
      <td>${ATTENDANCE_METHOD_LABELS[r.method] ?? r.method}</td>
    </tr>`,
    )
    .join("");

  const html = `
    <h2>דוח נוכחות</h2>
    <p>סה"כ רשומות: ${records.length}</p>
    <table>
      <thead><tr>
        <th>שם</th><th>תפקיד</th><th>תאריך</th><th>כניסה</th><th>יציאה</th>
        <th>משך</th><th>כתובת כניסה</th><th>כתובת יציאה</th><th>שיטה</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  return {
    body: html,
    contentType: "text/html;charset=utf-8",
    filename: `attendance-${stamp}.html`,
  };
}
