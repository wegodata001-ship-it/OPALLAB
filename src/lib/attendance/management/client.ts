import type {
  AttendanceActiveRecord,
  AttendanceEmployeeRosterRow,
  AttendanceEmployeeStats,
  AttendanceLabGeo,
  AttendanceManagementKpis,
  AttendanceManagementQuery,
  AttendanceManagementRecord,
  AttendanceManagementRecordsResult,
  AttendanceNotCheckedInRow,
} from "@/lib/attendance/management/types";

function toQueryString(
  query: AttendanceManagementQuery & {
    view?: string;
    id?: string;
    format?: string;
    userId?: string;
    scope?: "me" | "management";
    includePhotos?: boolean | number;
  },
): string {
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

function reviveRecord<T extends { checkIn?: string | Date; checkOut?: string | Date | null; createdAt?: string | Date }>(
  row: T,
): T & { checkIn: Date; checkOut?: Date | null; createdAt: Date } {
  return {
    ...row,
    checkIn: new Date(row.checkIn as string),
    checkOut: row.checkOut ? new Date(row.checkOut as string) : null,
    createdAt: new Date(row.createdAt as string),
  };
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? "שגיאה בטעינת נתונים");
  return json.data as T;
}

export async function fetchAttendanceKpis(): Promise<AttendanceManagementKpis> {
  return getJson("/api/attendance/management?view=kpis");
}

export async function fetchAttendanceRoster(): Promise<{
  roster: AttendanceEmployeeRosterRow[];
  labGeo: AttendanceLabGeo;
}> {
  return getJson("/api/attendance/management?view=roster");
}

export async function fetchEmployeeAttendanceStats(
  userId: string,
  query: Pick<AttendanceManagementQuery, "from" | "to"> = {},
): Promise<AttendanceEmployeeStats> {
  const qs = toQueryString({ ...query, view: "employee-stats", userId });
  return getJson(`/api/attendance/management?${qs}`);
}

export async function deleteAttendancePhoto(
  recordId: string,
  kind: "check-in" | "check-out",
): Promise<void> {
  const res = await fetch(
    `/api/attendance/management?id=${encodeURIComponent(recordId)}&kind=${kind}`,
    { method: "DELETE", credentials: "include" },
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? "מחיקת התמונה נכשלה");
}

export async function fetchActiveAttendance(
  query: AttendanceManagementQuery = {},
): Promise<AttendanceActiveRecord[]> {
  const qs = toQueryString({ ...query, view: "active" });
  const rows = await getJson<AttendanceActiveRecord[]>(`/api/attendance/management?${qs}`);
  return rows.map((r) => reviveRecord(r) as AttendanceActiveRecord);
}

export async function fetchAttendanceRecords(
  query: AttendanceManagementQuery,
): Promise<
  | ({ mode: "records" } & AttendanceManagementRecordsResult)
  | {
      mode: "not_checked_in";
      employees: AttendanceNotCheckedInRow[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }
> {
  const qs = toQueryString({ ...query, view: "records" });
  const data = await getJson<
    AttendanceManagementRecordsResult | {
      mode: "not_checked_in";
      employees: AttendanceNotCheckedInRow[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }
  >(`/api/attendance/management?${qs}`);

  if ("mode" in data && data.mode === "not_checked_in") return data;

  const result = data as AttendanceManagementRecordsResult;
  return {
    mode: "records" as const,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
    records: result.records.map((r) => reviveRecord(r) as AttendanceManagementRecord),
  };
}

export async function fetchAttendanceRecord(id: string): Promise<AttendanceManagementRecord> {
  const row = await getJson<AttendanceManagementRecord>(
    `/api/attendance/management?view=record&id=${encodeURIComponent(id)}`,
  );
  return reviveRecord(row) as AttendanceManagementRecord;
}

export async function fetchAttendancePhotoUrl(
  recordId: string,
  kind: "check-in" | "check-out",
): Promise<{ url: string; path: string }> {
  return getJson(
    `/api/attendance/management?view=photo&id=${encodeURIComponent(recordId)}&kind=${kind}`,
  );
}

export function attendanceExportUrl(query: AttendanceManagementQuery, format: "csv" | "pdf"): string {
  if (format === "pdf") {
    const qs = toQueryString({ ...query, scope: "management" });
    return `/api/attendance/pdf?${qs}`;
  }
  const qs = toQueryString({ ...query, view: "records", format: "csv" });
  return `/api/attendance/management?${qs}`;
}

export function formatLiveDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
