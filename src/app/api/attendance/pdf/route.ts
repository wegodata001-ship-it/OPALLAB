import { NextRequest } from "next/server";
import { requireSessionUserId } from "@/lib/auth/session";
import { jsonError } from "@/lib/api/response";
import type { AttendanceManagementQuery } from "@/lib/attendance/management/types";
import type { UserRole } from "@/lib/types";
import {
  attendancePdfResponse,
  generateAttendancePdfReport,
  type AttendancePdfRequest,
} from "@/lib/attendance/pdf/generate-report";

function parsePdfQuery(searchParams: URLSearchParams): AttendancePdfRequest {
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "25");
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const scopeParam = searchParams.get("scope");

  const query: AttendancePdfRequest = {
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
    lateOnly: searchParams.get("lateOnly") === "1" || searchParams.get("lateOnly") === "true",
    overtimeOnly:
      searchParams.get("overtimeOnly") === "1" || searchParams.get("overtimeOnly") === "true",
    anomaliesOnly:
      searchParams.get("anomaliesOnly") === "1" || searchParams.get("anomaliesOnly") === "true",
    compliance:
      (searchParams.get("compliance") as AttendanceManagementQuery["compliance"]) || undefined,
    scope: scopeParam === "me" ? "me" : "management",
    includePhotos: searchParams.get("includePhotos") !== "0",
  };

  if (month && year) {
    query.month = Number(month);
    query.year = Number(year);
  }

  return query;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    const query = parsePdfQuery(new URL(request.url).searchParams);
    const pdf = await generateAttendancePdfReport(userId, query);
    return attendancePdfResponse(pdf);
  } catch (error) {
    return jsonError(error);
  }
}
