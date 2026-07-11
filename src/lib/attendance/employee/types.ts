export type EmployeeAttendanceQuery = {
  from?: string;
  to?: string;
  month?: number;
  year?: number;
  page?: number;
  limit?: number;
  sortDir?: "asc" | "desc";
};

export type EmployeeAttendanceRecordRow = {
  id: string;
  checkIn: Date;
  checkOut: Date | null;
  durationHours: number | null;
  status: "open" | "closed";
  weekday: string;
};

export type EmployeeAttendanceSummary = {
  workDays: number;
  totalHours: number;
  overtimeHours: number;
  averageHoursPerDay: number;
};

export type EmployeeAttendanceResult = {
  records: EmployeeAttendanceRecordRow[];
  summary: EmployeeAttendanceSummary;
  openRecord: { id: string; checkIn: Date } | null;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
