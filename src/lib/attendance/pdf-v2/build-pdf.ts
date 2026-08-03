import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";
import { buildAttendanceReportHtml, stampFilename } from "@/lib/attendance/pdf-v2/html-builder";
import { htmlToPdfBuffer } from "@/lib/attendance/pdf-v2/render-pdf";
import type { AttendanceReportMeta } from "@/lib/attendance/pdf-v2/types";

export type { AttendanceReportMeta };

export async function buildAttendancePdfV2(opts: {
  records: AttendanceManagementRecord[];
  meta: AttendanceReportMeta;
  /** Skip Chromium render — HTML debug/preview only */
  htmlOnly?: boolean;
}): Promise<{ buffer: Buffer; filename: string; contentType: "application/pdf"; html: string }> {
  const html = buildAttendanceReportHtml(opts);
  if (opts.htmlOnly) {
    return {
      buffer: Buffer.alloc(0),
      filename: stampFilename(opts.meta.generatedAt),
      contentType: "application/pdf",
      html,
    };
  }
  const buffer = await htmlToPdfBuffer(html);
  return {
    buffer,
    filename: stampFilename(opts.meta.generatedAt),
    contentType: "application/pdf",
    html,
  };
}
