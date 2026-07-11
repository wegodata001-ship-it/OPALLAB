import { apiGet } from "@/lib/api/client";
import type { EmployeeAttendanceQuery, EmployeeAttendanceResult } from "@/lib/attendance/employee/types";

function toQueryString(query: EmployeeAttendanceQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchMyAttendance(query: EmployeeAttendanceQuery = {}): Promise<EmployeeAttendanceResult> {
  return apiGet<EmployeeAttendanceResult>(`/api/attendance/my${toQueryString(query)}`);
}
