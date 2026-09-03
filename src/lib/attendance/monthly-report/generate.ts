import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requireAttendanceManager } from "@/lib/attendance/management/auth";
import { getAttendanceRecordsForExport } from "@/lib/attendance/management/service";
import { monthCalendarBounds } from "@/lib/attendance/management/monthly-summary";
import {
  buildMonthlyHoursReportData,
  monthlyHoursReportFilename,
} from "@/lib/attendance/management/monthly-hours-report";
import { buildMonthlyHoursReportHtml } from "@/lib/attendance/monthly-report/html-builder";
import { buildMonthlyHoursReportXlsx } from "@/lib/attendance/monthly-report/excel-builder";
import { htmlToPdfBuffer } from "@/lib/attendance/pdf-v2/render-pdf";

export type MonthlyHoursReportRequest = {
  userId: string;
  year: number;
  month: number;
  format: "pdf" | "xlsx";
};

export async function generateMonthlyHoursReport(
  actorUserId: string,
  request: MonthlyHoursReportRequest,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  await requireAttendanceManager(actorUserId);

  if (!request.userId?.trim()) {
    throw new AppError("VALIDATION_ERROR", "חסר מזהה עובד", 400);
  }
  if (!Number.isFinite(request.year) || request.year < 2000 || request.year > 2100) {
    throw new AppError("VALIDATION_ERROR", "שנה לא תקינה", 400);
  }
  if (!Number.isFinite(request.month) || request.month < 1 || request.month > 12) {
    throw new AppError("VALIDATION_ERROR", "חודש לא תקין", 400);
  }

  const employee = await prisma.user.findUnique({
    where: { id: request.userId.trim() },
    select: { id: true, name: true, isActive: true },
  });
  if (!employee || !employee.isActive) {
    throw new AppError("NOT_FOUND", "עובד לא נמצא", 404);
  }

  const bounds = monthCalendarBounds(request.year, request.month);
  const records = await getAttendanceRecordsForExport({
    userId: employee.id,
    from: bounds.from,
    to: bounds.to,
  });

  const reportData = buildMonthlyHoursReportData({
    records,
    year: request.year,
    month: request.month,
    employeeName: employee.name,
    generatedAt: new Date(),
  });

  const filename = monthlyHoursReportFilename(
    employee.name,
    request.year,
    request.month,
    request.format === "pdf" ? "pdf" : "xlsx",
  );

  if (request.format === "xlsx") {
    const buffer = await buildMonthlyHoursReportXlsx(reportData);
    return {
      buffer,
      filename,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  const html = buildMonthlyHoursReportHtml(reportData);
  const buffer = await htmlToPdfBuffer(html, { landscape: false, footerLabel: "דוח שעות חודשי" });
  return { buffer, filename, contentType: "application/pdf" };
}

export function monthlyHoursReportResponse(result: {
  buffer: Buffer;
  filename: string;
  contentType: string;
  inline?: boolean;
}): Response {
  const disposition = result.inline ? "inline" : "attachment";
  return new Response(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `${disposition}; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(result.buffer.byteLength),
      "X-Attendance-Pdf-Engine": "v2-html-chromium",
    },
  });
}
