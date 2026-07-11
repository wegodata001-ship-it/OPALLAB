import { NextRequest } from "next/server";
import { requireSessionUserId } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getEmployeeAttendance } from "@/lib/attendance/employee/service";
import type { EmployeeAttendanceQuery } from "@/lib/attendance/employee/types";

function parseQuery(searchParams: URLSearchParams): EmployeeAttendanceQuery {
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "20");
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  return {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    month: month ? Number(month) : undefined,
    year: year ? Number(year) : undefined,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 20,
    sortDir: (searchParams.get("sortDir") as "asc" | "desc") || "desc",
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireSessionUserId();
    const { searchParams } = new URL(request.url);
    const data = await getEmployeeAttendance(userId, parseQuery(searchParams));
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
