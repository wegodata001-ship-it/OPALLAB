import type { AttendanceManagementQuery } from "@/lib/attendance/management/types";
import type { EmployeeAttendanceQuery } from "@/lib/attendance/employee/types";

function toQueryString(query: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    if (typeof value === "boolean") {
      if (value) params.set(key, "1");
      continue;
    }
    params.set(key, String(value));
  }
  return params.toString();
}

/** Unified attendance PDF URL (real application/pdf). */
export function attendancePdfUrl(
  query: AttendanceManagementQuery & {
    scope?: "me" | "management";
    month?: number;
    year?: number;
    includePhotos?: boolean;
  },
): string {
  const qs = toQueryString({
    ...query,
    scope: query.scope ?? "management",
    includePhotos: query.includePhotos === false ? 0 : undefined,
  });
  return `/api/attendance/pdf?${qs}`;
}

export function myAttendancePdfUrl(query: EmployeeAttendanceQuery): string {
  return attendancePdfUrl({
    scope: "me",
    from: query.from,
    to: query.to,
    month: query.month,
    year: query.year,
    sortDir: query.sortDir,
  });
}
