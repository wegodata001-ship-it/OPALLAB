import { NextRequest } from "next/server";
import { requireSessionUserId } from "@/lib/auth/session";
import { requireAttendanceManager } from "@/lib/attendance/management/auth";
import {
  clearAttendancePhoto,
  getActiveAttendanceRecords,
  getAttendanceKpis,
  getAttendanceLabGeo,
  getAttendancePhotoSignedUrl,
  getAttendanceRecordById,
  getAttendanceRecords,
  getAttendanceRecordsForExport,
  getEmployeeAttendanceRoster,
  type AttendancePhotoKind,
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
    photo: (searchParams.get("photo") as AttendanceManagementQuery["photo"]) || undefined,
    search: searchParams.get("search") ?? undefined,
    sortBy: (searchParams.get("sortBy") as AttendanceManagementQuery["sortBy"]) || undefined,
    sortDir: (searchParams.get("sortDir") as "asc" | "desc") || undefined,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 25,
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

    if (view === "photo") {
      const id = searchParams.get("id");
      const kind = searchParams.get("kind") as AttendancePhotoKind | null;
      if (!id) return jsonError(new AppError("VALIDATION_ERROR", "חסר מזהה רשומה", 400));
      if (kind !== "check-in" && kind !== "check-out") {
        return jsonError(new AppError("VALIDATION_ERROR", "סוג תמונה לא תקין", 400));
      }
      const photo = await getAttendancePhotoSignedUrl(id, kind);
      if (!photo) return jsonError(new AppError("NOT_FOUND", "אין תמונה זמינה", 404));
      return jsonOk(photo);
    }

    const format = searchParams.get("format");
    if (format) {
      const records = await getAttendanceRecordsForExport(query);
      const exportData = buildAttendanceExport(records, format);
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

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    await requireAttendanceManager(userId);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const kind = searchParams.get("kind") as AttendancePhotoKind | null;
    if (!id) throw new AppError("VALIDATION_ERROR", "חסר מזהה רשומה", 400);
    if (kind !== "check-in" && kind !== "check-out") {
      throw new AppError("VALIDATION_ERROR", "סוג תמונה לא תקין", 400);
    }

    await clearAttendancePhoto(id, kind);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
