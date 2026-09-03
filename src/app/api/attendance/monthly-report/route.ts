import { NextRequest } from "next/server";
import { requireSessionUserId } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/response";
import { AppError } from "@/lib/errors/app-error";
import {
  generateMonthlyHoursReport,
  monthlyHoursReportResponse,
} from "@/lib/attendance/monthly-report/generate";

/** Monthly hours report — PDF or XLSX for one employee + calendar month. */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    const { searchParams } = new URL(request.url);

    const employeeId = searchParams.get("userId")?.trim();
    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));
    const format = searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";

    if (!employeeId) {
      return jsonError(new AppError("VALIDATION_ERROR", "חסר מזהה עובד", 400));
    }

    const result = await generateMonthlyHoursReport(userId, {
      userId: employeeId,
      year,
      month,
      format,
    });

    return monthlyHoursReportResponse({
      ...result,
      inline: format === "pdf",
    });
  } catch (error) {
    return jsonError(error);
  }
}
