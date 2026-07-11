import { apiGet } from "@/lib/api/client";
import type { AttendanceRecord } from "@/lib/types";

export type AttendanceStatus = {
  hasOpenRecord: boolean;
  record: AttendanceRecord | null;
};

export async function fetchAttendanceStatus(): Promise<AttendanceStatus> {
  return apiGet<AttendanceStatus>(`/api/attendance/status?_=${Date.now()}`);
}
