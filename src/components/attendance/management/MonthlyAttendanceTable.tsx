"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  AttendanceApiError,
  fetchAttendanceRecords,
  fetchEmployeeAttendanceStats,
  monthlyHoursReportUrl,
  patchAttendanceDateTimes,
  postManualAttendance,
} from "@/lib/attendance/management/client";
import {
  buildMonthRows,
  computeStatsFromRecords,
  dateKeyToJerusalemDate,
  formatHoursMinutes,
  formatMonthYearLabel,
  formatWeekdayJerusalem,
  jerusalemYearMonth,
  monthCalendarBounds,
  rowOvertimeDisplay,
  shiftMonth,
  type MonthDayRow,
} from "@/lib/attendance/management/monthly-summary";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";
import { formatHHmmJerusalem, jerusalemDateKey } from "@/lib/attendance/management/edit-time";
import { formatDate, formatTime, cn } from "@/lib/utils";
import { AttendanceStatusBadge } from "@/components/attendance/management/AttendanceStatusBadge";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, Pencil, Plus } from "lucide-react";
import { AttendancePdfPreview } from "@/components/attendance/pdf/AttendancePdfPreview";

type DateTimeFormState = {
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
};

function emptyDateTimeForm(dateKey: string): DateTimeFormState {
  return {
    checkInDate: dateKey,
    checkInTime: "",
    checkOutDate: dateKey,
    checkOutTime: "",
  };
}

function recordToForm(record: AttendanceManagementRecord): DateTimeFormState {
  return {
    checkInDate: jerusalemDateKey(record.checkIn),
    checkInTime: formatHHmmJerusalem(record.checkIn),
    checkOutDate: record.checkOut ? jerusalemDateKey(record.checkOut) : jerusalemDateKey(record.checkIn),
    checkOutTime: record.checkOut ? formatHHmmJerusalem(record.checkOut) : "",
  };
}

function AttendanceDateTimeForm({
  form,
  onChange,
}: {
  form: DateTimeFormState;
  onChange: (next: DateTimeFormState) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">תאריך כניסה</label>
        <input
          type="date"
          value={form.checkInDate}
          onChange={(e) => onChange({ ...form, checkInDate: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
          dir="ltr"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">שעת כניסה</label>
        <input
          type="time"
          value={form.checkInTime}
          onChange={(e) => onChange({ ...form, checkInTime: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
          dir="ltr"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">תאריך יציאה</label>
        <input
          type="date"
          value={form.checkOutDate}
          onChange={(e) => onChange({ ...form, checkOutDate: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
          dir="ltr"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">שעת יציאה</label>
        <input
          type="time"
          value={form.checkOutTime}
          onChange={(e) => onChange({ ...form, checkOutTime: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
          dir="ltr"
        />
      </div>
    </div>
  );
}

function AddHoursDialog({
  dateKey,
  employeeId,
  employeeName,
  open,
  onClose,
  onSaved,
  onEditExisting,
}: {
  dateKey: string;
  employeeId: string;
  employeeName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onEditExisting: (recordId: string) => void;
}) {
  const [form, setForm] = useState<DateTimeFormState>(() => emptyDateTimeForm(dateKey));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictRecordId, setConflictRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(emptyDateTimeForm(dateKey));
      setError(null);
      setConflictRecordId(null);
    }
  }, [open, dateKey]);

  const save = async () => {
    if (!form.checkInTime.trim()) {
      setError("יש להזין שעת כניסה");
      return;
    }
    setSaving(true);
    setError(null);
    setConflictRecordId(null);
    try {
      await postManualAttendance({
        userId: employeeId,
        checkInDate: form.checkInDate,
        checkInTime: form.checkInTime.trim(),
        checkOutDate: form.checkOutTime.trim() ? form.checkOutDate : undefined,
        checkOutTime: form.checkOutTime.trim() || undefined,
      });
      await onSaved();
      onClose();
    } catch (e) {
      if (e instanceof AttendanceApiError && e.details?.existingRecordId) {
        setConflictRecordId(e.details.existingRecordId);
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "שגיאה בשמירה");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`הוספת נוכחות — ${employeeName}`}
      className="max-w-md"
      overlayClassName="z-[60]"
    >
      <div className="space-y-4">
        <AttendanceDateTimeForm form={form} onChange={setForm} />
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{error}</p>
            {conflictRecordId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEditExisting(conflictRecordId);
                }}
              >
                ערוך את הרשומה הקיימת
              </Button>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={() => void save()} disabled={saving || !form.checkInTime.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
            שמור
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditHoursDialog({
  record,
  employeeName,
  open,
  onClose,
  onSaved,
  onEditExisting,
}: {
  record: AttendanceManagementRecord;
  employeeName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onEditExisting: (recordId: string) => void;
}) {
  const [form, setForm] = useState<DateTimeFormState>(() => recordToForm(record));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictRecordId, setConflictRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(recordToForm(record));
      setError(null);
      setConflictRecordId(null);
    }
  }, [open, record]);

  const save = async () => {
    if (!form.checkInTime.trim()) {
      setError("יש להזין שעת כניסה");
      return;
    }
    setSaving(true);
    setError(null);
    setConflictRecordId(null);
    try {
      await patchAttendanceDateTimes({
        recordId: record.id,
        checkInDate: form.checkInDate,
        checkInTime: form.checkInTime.trim(),
        checkOutDate: form.checkOutTime.trim() ? form.checkOutDate : undefined,
        checkOutTime: form.checkOutTime.trim() || undefined,
      });
      await onSaved();
      onClose();
    } catch (e) {
      if (e instanceof AttendanceApiError && e.details?.existingRecordId) {
        setConflictRecordId(e.details.existingRecordId);
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : "שגיאה בשמירה");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`עריכת נוכחות — ${employeeName}`}
      className="max-w-md"
      overlayClassName="z-[60]"
    >
      <div className="space-y-4">
        <AttendanceDateTimeForm form={form} onChange={setForm} />
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{error}</p>
            {conflictRecordId && conflictRecordId !== record.id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEditExisting(conflictRecordId);
                }}
              >
                ערוך את הרשומה הקיימת
              </Button>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={() => void save()} disabled={saving || !form.checkInTime.trim()}>
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
  rows,
  canEdit,
  onEdit,
  onAdd,
}: {
  rows: MonthDayRow[];
  canEdit: boolean;
  onEdit: (record: AttendanceManagementRecord) => void;
  onAdd: (dateKey: string) => void;
}) {
  return (
    <div className="hidden md:block max-h-[min(28rem,50vh)] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm text-right">
        <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_rgb(226_232_240)]">
          <tr className="border-b text-xs text-slate-600">
            <th className="px-3 py-2 font-semibold bg-slate-50">תאריך</th>
            <th className="px-3 py-2 font-semibold bg-slate-50">יום</th>
            <th className="px-3 py-2 font-semibold bg-slate-50">כניסה</th>
            <th className="px-3 py-2 font-semibold bg-slate-50">יציאה</th>
            <th className="px-3 py-2 font-semibold bg-slate-50">שעות עבודה</th>
            <th className="px-3 py-2 font-semibold bg-slate-50">שעות נוספות</th>
            <th className="px-3 py-2 font-semibold bg-slate-50">סטטוס</th>
            {canEdit && <th className="px-3 py-2 font-semibold bg-slate-50">פעולות</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ dateKey, record }) => {
            const dayDate = dateKeyToJerusalemDate(dateKey);
            const hasRecord = Boolean(record);
            return (
              <tr
                key={dateKey}
                className={cn(
                  "border-b last:border-0 hover:bg-slate-50/80",
                  !hasRecord && "text-slate-500",
                )}
              >
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(dayDate)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatWeekdayJerusalem(dayDate)}</td>
                <td className="px-3 py-2 font-mono" dir="ltr">
                  {record ? formatTime(record.checkIn) : "—"}
                </td>
                <td className="px-3 py-2 font-mono" dir="ltr">
                  {record?.checkOut ? formatTime(record.checkOut) : "—"}
                </td>
                <td className="px-3 py-2">
                  {record ? formatHoursMinutes(record.durationHours) : "—"}
                </td>
                <td className="px-3 py-2">
                  {record ? rowOvertimeDisplay(record) : "—"}
                </td>
                <td className="px-3 py-2">
                  {record ? (
                    <AttendanceStatusBadge record={record} />
                  ) : (
                    <span className="text-xs font-medium text-slate-500">אין נוכחות</span>
                  )}
                </td>
                {canEdit && (
                  <td className="px-3 py-2">
                    {record ? (
                      <button
                        type="button"
                        onClick={() => onEdit(record!)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        עריכה
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdd(dateKey)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        הוסף שעות
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MobileCards({
  rows,
  canEdit,
  onEdit,
  onAdd,
}: {
  rows: MonthDayRow[];
  canEdit: boolean;
  onEdit: (record: AttendanceManagementRecord) => void;
  onAdd: (dateKey: string) => void;
}) {
  return (
    <div className="md:hidden max-h-[min(28rem,50vh)] overflow-y-auto space-y-3 pr-0.5">
      {rows.map(({ dateKey, record }) => {
        const dayDate = dateKeyToJerusalemDate(dateKey);
        return (
          <div
            key={dateKey}
            className={cn(
              "rounded-xl border p-3 space-y-2 bg-white",
              record ? "border-slate-200" : "border-slate-100 bg-slate-50/50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">
                {formatDate(dayDate)} · {formatWeekdayJerusalem(dayDate)}
              </p>
              {record ? (
                <AttendanceStatusBadge record={record} />
              ) : (
                <span className="text-xs font-medium text-slate-500">אין נוכחות</span>
              )}
            </div>
            {record ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] text-slate-500">כניסה</p>
                    <p className="font-mono font-semibold" dir="ltr">
                      {formatTime(record.checkIn)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">יציאה</p>
                    <p className="font-mono font-semibold" dir="ltr">
                      {record.checkOut ? formatTime(record.checkOut) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">שעות</p>
                    <p className="font-semibold">{formatHoursMinutes(record.durationHours)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">נוספות</p>
                    <p className="font-semibold">{rowOvertimeDisplay(record)}</p>
                  </div>
                </div>
                {canEdit && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => onEdit(record)}>
                    <Pencil className="h-3.5 w-3.5 ml-1" />
                    עריכה
                  </Button>
                )}
              </>
            ) : (
              canEdit && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => onAdd(dateKey)}>
                  <Plus className="h-3.5 w-3.5 ml-1" />
                  הוסף שעות
                </Button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MonthlyAttendanceTable({
  employeeId,
  employeeName,
  canEdit,
  reloadSignal = 0,
  onChanged,
  initialYear,
  initialMonth,
}: {
  employeeId: string;
  employeeName: string;
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
  const [addDateKey, setAddDateKey] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  const bounds = useMemo(() => monthCalendarBounds(year, month), [year, month]);
  const monthLabel = formatMonthYearLabel(year, month);
  const isCurrentMonth = year === now.year && month === now.month;
  const monthRows = useMemo(() => buildMonthRows(records, year, month), [records, year, month]);

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
        sortDir: "asc",
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

  useEffect(() => {
    if (!pendingEditId || loading) return;
    const found = records.find((r) => r.id === pendingEditId);
    if (found) {
      setEditRecord(found);
      setPendingEditId(null);
    }
  }, [pendingEditId, records, loading]);

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
    await fetchEmployeeAttendanceStats(employeeId, bounds);
    setSuccessMsg("השעות נשמרו בהצלחה");
    window.setTimeout(() => setSuccessMsg(null), 3500);
    onChanged?.();
  };

  const openEditExisting = (recordId: string) => {
    const found = records.find((r) => r.id === recordId);
    if (found) {
      setEditRecord(found);
    } else {
      setPendingEditId(recordId);
      void load();
    }
  };

  const downloadExcel = async () => {
    setExcelBusy(true);
    try {
      const url = monthlyHoursReportUrl({
        userId: employeeId,
        year,
        month,
        format: "xlsx",
      });
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        let message = "יצירת קובץ Excel נכשלה";
        try {
          const json = (await res.json()) as { error?: { message?: string } };
          if (json.error?.message) message = json.error.message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/i.exec(disposition);
      const filename = match?.[1] ?? `attendance-${year}-${String(month).padStart(2, "0")}.xlsx`;
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setSuccessMsg(null);
      window.alert(e instanceof Error ? e.message : "שגיאה בהורדת Excel");
    } finally {
      setExcelBusy(false);
    }
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

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-opal-gold" />
        </div>
      ) : (
        <>
          <DesktopTable
            rows={monthRows}
            canEdit={canEdit}
            onEdit={setEditRecord}
            onAdd={setAddDateKey}
          />
          <MobileCards
            rows={monthRows}
            canEdit={canEdit}
            onEdit={setEditRecord}
            onAdd={setAddDateKey}
          />
        </>
      )}

      {!loading && (
        <>
          <div className="space-y-2 pt-2">
            <h4 className="text-sm font-semibold text-slate-800">סיכום חודשי</h4>
            <SummaryStrip stats={summary} />
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-slate-800">דוח שעות חודשי</h4>
            <p className="text-xs text-slate-500">
              {employeeName} · {monthLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setPdfPreviewUrl(
                    monthlyHoursReportUrl({
                      userId: employeeId,
                      year,
                      month,
                      format: "pdf",
                    }),
                  )
                }
              >
                <FileText className="h-4 w-4 ml-1" />
                PDF דוח שעות
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={excelBusy}
                onClick={() => void downloadExcel()}
              >
                {excelBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-1" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 ml-1" />
                )}
                Excel דוח שעות
              </Button>
            </div>
          </div>
        </>
      )}

      {addDateKey && (
        <AddHoursDialog
          dateKey={addDateKey}
          employeeId={employeeId}
          employeeName={employeeName}
          open={Boolean(addDateKey)}
          onClose={() => setAddDateKey(null)}
          onSaved={afterSave}
          onEditExisting={openEditExisting}
        />
      )}

      {editRecord && (
        <EditHoursDialog
          record={editRecord}
          employeeName={employeeName}
          open={Boolean(editRecord)}
          onClose={() => setEditRecord(null)}
          onSaved={afterSave}
          onEditExisting={openEditExisting}
        />
      )}

      <AttendancePdfPreview
        open={Boolean(pdfPreviewUrl)}
        url={pdfPreviewUrl}
        title={`דוח שעות חודשי — ${employeeName}`}
        onClose={() => setPdfPreviewUrl(null)}
      />
    </section>
  );
}
