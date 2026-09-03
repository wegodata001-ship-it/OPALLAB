import ExcelJS from "exceljs";
import type { MonthlyHoursReportData } from "@/lib/attendance/management/monthly-hours-report";
import { formatHoursMinutes } from "@/lib/attendance/management/monthly-summary";
import { formatDate } from "@/lib/utils";
import { LAB_INFO } from "@/lib/constants/labels";

export async function buildMonthlyHoursReportXlsx(data: MonthlyHoursReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OPAL LAB";
  workbook.created = data.generatedAt;

  const sheet = workbook.addWorksheet("דוח שעות", {
    views: [{ rightToLeft: true }],
  });

  sheet.columns = [
    { key: "date", width: 14 },
    { key: "weekday", width: 12 },
    { key: "checkIn", width: 10 },
    { key: "checkOut", width: 10 },
    { key: "workHours", width: 12 },
    { key: "overtime", width: 12 },
    { key: "status", width: 22 },
    { key: "source", width: 16 },
  ];

  sheet.mergeCells("A1:H1");
  sheet.getCell("A1").value = LAB_INFO.fullName;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A1").alignment = { horizontal: "center" };

  sheet.mergeCells("A2:H2");
  sheet.getCell("A2").value = "דוח שעות חודשי";
  sheet.getCell("A2").font = { bold: true, size: 12 };
  sheet.getCell("A2").alignment = { horizontal: "center" };

  sheet.getCell("A4").value = "שם העובד:";
  sheet.getCell("B4").value = data.employeeName;
  sheet.getCell("A5").value = "חודש:";
  sheet.getCell("B5").value = data.monthLabel;
  sheet.getCell("A6").value = "תאריך הפקת הדוח:";
  sheet.getCell("B6").value = formatDate(data.generatedAt);

  sheet.getCell("A8").value = "ימי עבודה:";
  sheet.getCell("B8").value = data.summary.workDays;
  sheet.getCell("C8").value = 'סה"כ שעות עבודה:';
  sheet.getCell("D8").value = formatHoursMinutes(data.summary.totalHours);
  sheet.getCell("E8").value = 'סה"כ שעות נוספות:';
  sheet.getCell("F8").value = formatHoursMinutes(data.summary.overtimeHours);
  sheet.getCell("G8").value = "איחורים:";
  sheet.getCell("H8").value = data.summary.lateCount;

  const headerRow = sheet.getRow(10);
  headerRow.values = [
    "תאריך",
    "יום",
    "כניסה",
    "יציאה",
    "שעות עבודה",
    "שעות נוספות",
    "סטטוס",
    "מקור",
  ];
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1F5F9" },
  };

  let rowIdx = 11;
  for (const row of data.rows) {
    const r = sheet.getRow(rowIdx++);
    r.values = [
      row.dateDisplay,
      row.weekday,
      row.checkIn,
      row.checkOut,
      row.workHours,
      row.overtimeHours,
      row.status,
      row.source,
    ];
  }

  const totalsStart = rowIdx + 1;
  sheet.getCell(`A${totalsStart}`).value = 'סה"כ ימי עבודה';
  sheet.getCell(`B${totalsStart}`).value = data.summary.workDays;
  sheet.getCell(`C${totalsStart}`).value = 'סה"כ שעות עבודה';
  sheet.getCell(`D${totalsStart}`).value = formatHoursMinutes(data.summary.totalHours);
  sheet.getCell(`E${totalsStart}`).value = 'סה"כ שעות נוספות';
  sheet.getCell(`F${totalsStart}`).value = formatHoursMinutes(data.summary.overtimeHours);
  sheet.getCell(`G${totalsStart}`).value = "איחורים";
  sheet.getCell(`H${totalsStart}`).value = data.summary.lateCount;

  sheet.getCell(`A${totalsStart + 1}`).value = "יציאות מוקדמות";
  sheet.getCell(`B${totalsStart + 1}`).value = data.summary.earlyLeaveCount;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
