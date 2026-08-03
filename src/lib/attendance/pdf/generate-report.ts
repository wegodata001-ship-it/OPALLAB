import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requireAttendanceManager } from "@/lib/attendance/management/auth";
import { getAttendanceRecordsForExport } from "@/lib/attendance/management/service";
import type { AttendanceManagementQuery } from "@/lib/attendance/management/types";
import {
  buildAttendancePdf,
  type AttendancePdfMeta,
} from "@/lib/attendance/pdf/build-attendance-pdf";

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type AttendancePdfRequest = AttendanceManagementQuery & {
  scope?: "me" | "management";
  month?: number;
  year?: number;
  includePhotos?: boolean;
};

function resolveRange(query: AttendancePdfRequest): { from?: string; to?: string } {
  if (query.month != null && query.year != null) {
    const start = startOfDay(new Date(query.year, query.month - 1, 1));
    const end = endOfDay(new Date(query.year, query.month, 0));
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }
  return { from: query.from, to: query.to };
}

export async function generateAttendancePdfReport(
  actorUserId: string,
  request: AttendancePdfRequest,
): Promise<{ buffer: Buffer; filename: string; contentType: "application/pdf" }> {
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, name: true },
  });
  if (!actor) throw new AppError("UNAUTHORIZED", "נדרשת התחברות", 401);

  const range = resolveRange(request);
  const scope = request.scope === "me" ? "me" : "management";

  let query: AttendanceManagementQuery = {
    ...request,
    from: range.from,
    to: range.to,
  };

  let employeeName: string | null | undefined;
  let mode: AttendancePdfMeta["mode"] = "general";

  if (scope === "me") {
    query = { ...query, userId: actorUserId };
    employeeName = actor.name;
    mode = "personal";
  } else {
    await requireAttendanceManager(actorUserId);
    if (query.userId) {
      const employee = await prisma.user.findUnique({
        where: { id: query.userId },
        select: { name: true },
      });
      employeeName = employee?.name ?? null;
      mode = "personal";
    } else {
      mode = "general";
    }
  }

  const records = await getAttendanceRecordsForExport(query);

  return buildAttendancePdf({
    records,
    meta: {
      generatedAt: new Date(),
      generatedByName: actor.name,
      employeeName,
      dateFrom: query.from,
      dateTo: query.to,
      includePhotos: request.includePhotos !== false,
      mode,
    },
  });
}

export function attendancePdfResponse(result: {
  buffer: Buffer;
  filename: string;
  contentType: "application/pdf";
}): Response {
  return new Response(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(result.buffer.byteLength),
    },
  });
}
