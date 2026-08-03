export type AttendanceReportMeta = {
  generatedAt: Date;
  generatedByName: string;
  employeeName?: string | null;
  dateFrom?: string;
  dateTo?: string;
  mode: "personal" | "general";
};
