import { NextRequest } from "next/server";
import { requireSessionUserId } from "@/lib/auth/session";
import { requireAttendanceManager } from "@/lib/attendance/management/auth";
import {
  getActiveAttendanceRecords,
  getAttendanceKpis,
  getAttendanceLabGeo,
  getAttendanceRecordById,
  getAttendanceRecords,
  getAttendanceRecordsForExport,
  getEmployeeAttendanceRoster,
  getEmployeeAttendanceStats,
} from "@/lib/attendance/management/service";
import type { AttendanceManagementQuery } from "@/lib/attendance/management/types";
import { jsonError, jsonOk } from "@/lib/api/response";
import { buildAttendanceExport } from "@/lib/attendance/management/export";
import { AppError } from "@/lib/errors/app-error";
import type { UserRole } from "@/lib/types";

function parseQuery(searchParams: URLSearchParams): AttendanceManagementQuery {
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "25");
  return {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    userId: searchParams.get("userId") ?? undefined,
    role: (searchParams.get("role") as UserRole) || undefined,
    status: (searchParams.get("status") as AttendanceManagementQuery["status"]) || undefined,
    gps: (searchParams.get("gps") as AttendanceManagementQuery["gps"]) || undefined,
    search: searchParams.get("search") ?? undefined,
    sortBy: (searchParams.get("sortBy") as AttendanceManagementQuery["sortBy"]) || undefined,
    sortDir: (searchParams.get("sortDir") as "asc" | "desc") || undefined,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 25,
    lateOnly: searchParams.get("lateOnly") === "1" || searchParams.get("lateOnly") === "true",
    overtimeOnly:
      searchParams.get("overtimeOnly") === "1" || searchParams.get("overtimeOnly") === "true",
    anomaliesOnly:
      searchParams.get("anomaliesOnly") === "1" || searchParams.get("anomaliesOnly") === "true",
    compliance:
      (searchParams.get("compliance") as AttendanceManagementQuery["compliance"]) || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    await requireAttendanceManager(userId);

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "records";
    const query = parseQuery(searchParams);

    if (view === "kpis") {
      return jsonOk(await getAttendanceKpis());
    }

    if (view === "roster") {
      const [roster, labGeo] = await Promise.all([
        getEmployeeAttendanceRoster(),
        getAttendanceLabGeo(),
      ]);
      return jsonOk({ roster, labGeo });
    }

    if (view === "employee-stats") {
      const id = searchParams.get("userId");
      if (!id) return jsonError(new AppError("VALIDATION_ERROR", "חסר מזהה עובד", 400));
      return jsonOk(
        await getEmployeeAttendanceStats(id, {
          from: query.from,
          to: query.to,
        }),
      );
    }

    if (view === "active") {
      return jsonOk(await getActiveAttendanceRecords(query));
    }

    if (view === "record") {
      const id = searchParams.get("id");
      if (!id) return jsonError(new Error("חסר מזהה רשומה"));
      const record = await getAttendanceRecordById(id);
      if (!record) return jsonError(new Error("רשומה לא נמצאה"));
      return jsonOk(record);
    }

    const format = searchParams.get("format");
    if (format === "pdf") {
      const {
        attendancePdfResponse,
        generateAttendancePdfReport,
      } = await import("@/lib/attendance/pdf/generate-report");
      const pdf = await generateAttendancePdfReport(userId, {
        ...query,
        scope: "management",
      });
      return attendancePdfResponse(pdf);
    }
    if (format) {
      const records = await getAttendanceRecordsForExport(query);
      const exportData = buildAttendanceExport(records, "csv");
      return new Response(exportData.body, {
        status: 200,
        headers: {
          "Content-Type": exportData.contentType,
          "Content-Disposition": `attachment; filename="${exportData.filename}"`,
        },
      });
    }

    if (query.status === "not_checked_in") {
      const { getNotCheckedInEmployees } = await import("@/lib/attendance/management/service");
      const employees = await getNotCheckedInEmployees(query);
      const page = query.page ?? 1;
      const limit = query.limit ?? 25;
      const start = (page - 1) * limit;
      const slice = employees.slice(start, start + limit);
      return jsonOk({
        mode: "not_checked_in",
        employees: slice,
        total: employees.length,
        page,
        limit,
        totalPages: Math.ceil(employees.length / limit) || 1,
      });
    }

    return jsonOk(await getAttendanceRecords(query));
  } catch (error) {
    return jsonError(error);
  }
}

/** Manual check-in / check-out time edit — ADMIN / OWNER / SECRETARY only. */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    await requireAttendanceManager(userId);

    const body = (await request.json()) as {
      recordId?: string;
      field?: "checkIn" | "checkOut";
      time?: string;
    };

    if (!body.recordId?.trim()) {
      return jsonError(new AppError("VALIDATION_ERROR", "חסר מזהה רשומה", 400));
    }
    if (body.field !== "checkIn" && body.field !== "checkOut") {
      return jsonError(new AppError("VALIDATION_ERROR", "שדה לא תקין", 400));
    }
    if (!body.time?.trim()) {
      return jsonError(new AppError("VALIDATION_ERROR", "חסרה שעה", 400));
    }

    const { editAttendanceTime } = await import(
      "@/lib/attendance/management/edit-attendance-time"
    );
    const record = await editAttendanceTime({
      recordId: body.recordId.trim(),
      field: body.field,
      timeHHmm: body.time.trim(),
      actorId: userId,
    });
    return jsonOk(record);
  } catch (error) {
    return jsonError(error);
  }
}
