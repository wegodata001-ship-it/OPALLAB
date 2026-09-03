"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  fetchAttendanceRecords,
  fetchEmployeeAttendanceStats,
  patchAttendanceTime,
} from "@/lib/attendance/management/client";
import {
  attendanceRowStatus,
  computeStatsFromRecords,
  formatHoursMinutes,
  formatMonthYearLabel,
  formatWeekdayJerusalem,
  jerusalemYearMonth,
  monthCalendarBounds,
  rowOvertimeHours,
  shiftMonth,
} from "@/lib/attendance/management/monthly-summary";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";
import { formatHHmmJerusalem } from "@/lib/attendance/management/edit-time";
import { formatDate, formatTime, cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, Pencil } from "lucide-react";

function MonthlyRowEditDialog({
  record,
  open,
  onClose,
  onSaved,
}: {
  record: AttendanceManagementRecord;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const originalIn = formatHHmmJerusalem(record.checkIn);
  const originalOut = record.checkOut ? formatHHmmJerusalem(record.checkOut) : "";
  const [checkIn, setCheckIn] = useState(originalIn);
  const [checkOut, setCheckOut] = useState(originalOut);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCheckIn(originalIn);
      setCheckOut(originalOut);
      setError(null);
    }
  }, [open, originalIn, originalOut]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (checkIn.trim() !== originalIn) {
        await patchAttendanceTime({
          recordId: record.id,
          field: "checkIn",
          time: checkIn.trim(),
        });
      }
      if (checkOut.trim()) {
        if (!record.checkOut || checkOut.trim() !== originalOut) {
          await patchAttendanceTime({
            recordId: record.id,
            field: "checkOut",
            time: checkOut.trim(),
          });
        }
      } else if (record.checkOut && !checkOut.trim()) {
        setError("יש להזין שעת יציאה");
        setSaving(false);
        return;
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`עריכת שעות — ${formatDate(record.checkIn)}`}
      className="max-w-md"
      overlayClassName="z-[60]"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          תאריך: <span className="font-semibold text-slate-900">{formatDate(record.checkIn)}</span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שעת כניסה</label>
            <input
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שעת יציאה</label>
            <input
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
              dir="ltr"
              placeholder="--:--"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={() => void save()} disabled={saving || !checkIn.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
            שמור
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SummaryStrip({ stats }: { stats: ReturnType<typeof computeStatsFromRecords> }) {
  const items = [
    { label: "ימי עבודה", value: String(stats.workDays) },
    { label: 'סה"כ שעות', value: formatHoursMinutes(stats.totalHours) },
    { label: "שעות נוספות", value: formatHoursMinutes(stats.overtimeHours) },
    { label: "איחורים", value: String(stats.lateCount) },
    { label: "יציאות מוקדמות", value: String(stats.earlyLeaveCount) },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border bg-slate-50 px-3 py-2">
          <p className="text-[11px] text-slate-500">{item.label}</p>
          <p className="text-base font-bold text-slate-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function DesktopTable({
  records,
  canEdit,
  onEdit,
}: {
  records: AttendanceManagementRecord[];
  canEdit: boolean;
  onEdit: (record: AttendanceManagementRecord) => void;
}) {
  return (
    <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm text-right">
        <thead>
          <tr className="border-b bg-slate-50 text-xs text-slate-600">
            <th className="px-3 py-2 font-semibold">תאריך</th>
            <th className="px-3 py-2 font-semibold">יום</th>
            <th className="px-3 py-2 font-semibold">כניסה</th>
            <th className="px-3 py-2 font-semibold">יציאה</th>
            <th className="px-3 py-2 font-semibold">שעות עבודה</th>
            <th className="px-3 py-2 font-semibold">שעות נוספות</th>
            <th className="px-3 py-2 font-semibold">סטטוס</th>
            {canEdit && <th className="px-3 py-2 font-semibold">פעולות</th>}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/80">
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.checkIn)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatWeekdayJerusalem(r.checkIn)}</td>
              <td className="px-3 py-2 font-mono" dir="ltr">
                {formatTime(r.checkIn)}
              </td>
              <td className="px-3 py-2 font-mono" dir="ltr">
                {r.checkOut ? formatTime(r.checkOut) : "—"}
              </td>
              <td className="px-3 py-2">{formatHoursMinutes(r.durationHours)}</td>
              <td className="px-3 py-2">{rowOvertimeHours(r) || "0"}</td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "text-xs font-medium",
                    !r.checkOut ? "text-amber-700" : "text-slate-700",
                  )}
                >
                  {attendanceRowStatus(r)}
                </span>
              </td>
              {canEdit && (
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onEdit(r)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    עריכה
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({
  records,
  canEdit,
  onEdit,
}: {
  records: AttendanceManagementRecord[];
  canEdit: boolean;
  onEdit: (record: AttendanceManagementRecord) => void;
}) {
  return (
    <div className="md:hidden space-y-3">
      {records.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-white">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">
              {formatDate(r.checkIn)} · {formatWeekdayJerusalem(r.checkIn)}
            </p>
            <span
              className={cn(
                "text-xs font-medium",
                !r.checkOut ? "text-amber-700" : "text-slate-600",
              )}
            >
              {attendanceRowStatus(r)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[11px] text-slate-500">כניסה</p>
              <p className="font-mono font-semibold" dir="ltr">
                {formatTime(r.checkIn)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">יציאה</p>
              <p className="font-mono font-semibold" dir="ltr">
                {r.checkOut ? formatTime(r.checkOut) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">שעות</p>
              <p className="font-semibold">{formatHoursMinutes(r.durationHours)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">נוספות</p>
              <p className="font-semibold">{rowOvertimeHours(r) || "0"}</p>
            </div>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => onEdit(r)}>
              <Pencil className="h-3.5 w-3.5 ml-1" />
              עריכה
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

export function MonthlyAttendanceTable({
  employeeId,
  canEdit,
  reloadSignal = 0,
  onChanged,
  initialYear,
  initialMonth,
}: {
  employeeId: string;
  canEdit: boolean;
  reloadSignal?: number;
  onChanged?: () => void;
  initialYear?: number;
  initialMonth?: number;
}) {
  const now = jerusalemYearMonth();
  const [year, setYear] = useState(initialYear ?? now.year);
  const [month, setMonth] = useState(initialMonth ?? now.month);
  const [records, setRecords] = useState<AttendanceManagementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [editRecord, setEditRecord] = useState<AttendanceManagementRecord | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const bounds = useMemo(() => monthCalendarBounds(year, month), [year, month]);
  const monthLabel = formatMonthYearLabel(year, month);
  const isCurrentMonth = year === now.year && month === now.month;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAttendanceRecords({
        userId: employeeId,
        from: bounds.from,
        to: bounds.to,
        page: 1,
        limit: 200,
        sortBy: "checkIn",
        sortDir: "desc",
      });
      if (result.mode === "records") {
        setRecords(result.records);
      } else {
        setRecords([]);
      }
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId, bounds.from, bounds.to]);

  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  const summary = useMemo(() => computeStatsFromRecords(records), [records]);

  const goPrev = () => {
    const next = shiftMonth(year, month, -1);
    setYear(next.year);
    setMonth(next.month);
  };

  const goNext = () => {
    const next = shiftMonth(year, month, 1);
    setYear(next.year);
    setMonth(next.month);
  };

  const goCurrent = () => {
    setYear(now.year);
    setMonth(now.month);
  };

  const afterSave = async () => {
    await load();
    // Reconcile with server stats (same calculation path)
    await fetchEmployeeAttendanceStats(employeeId, bounds);
    setSuccessMsg("השעות נשמרו בהצלחה");
    window.setTimeout(() => setSuccessMsg(null), 3500);
    onChanged?.();
  };

  return (
    <section className="space-y-4 pt-2 border-t border-slate-200">
      <div className="flex flex-col gap-2">
        <h3 className="font-bold text-slate-900 text-base">טבלת שעות חודשית</h3>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" onClick={goPrev} aria-label="חודש קודם">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="min-w-[9rem] text-center font-semibold text-slate-900 px-2">
              {monthLabel}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={goNext} aria-label="חודש הבא">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          {!isCurrentMonth && (
            <Button type="button" size="sm" variant="outline" onClick={goCurrent}>
              החודש הנוכחי
            </Button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {successMsg}
        </div>
      )}

      <SummaryStrip stats={summary} />

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-opal-gold" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">אין רשומות נוכחות בחודש זה</p>
      ) : (
        <>
          <DesktopTable records={records} canEdit={canEdit} onEdit={setEditRecord} />
          <MobileCards records={records} canEdit={canEdit} onEdit={setEditRecord} />
        </>
      )}

      {editRecord && (
        <MonthlyRowEditDialog
          record={editRecord}
          open={Boolean(editRecord)}
          onClose={() => setEditRecord(null)}
          onSaved={afterSave}
        />
      )}
    </section>
  );
}
