"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  attendanceExportUrl,
  fetchAttendanceRecords,
  fetchEmployeeAttendanceStats,
  patchAttendanceTime,
} from "@/lib/attendance/management/client";
import { AttendancePdfPreview } from "@/components/attendance/pdf/AttendancePdfPreview";
import type {
  AttendanceEmployeeRosterRow,
  AttendanceEmployeeStats,
  AttendanceLabGeo,
  AttendanceManagementRecord,
  AttendanceTimeEditMeta,
} from "@/lib/attendance/management/types";
import type { ConnectedDeviceRow } from "@/components/attendance/management/ConnectedDevicesTab";
import { EmployeeAvatar } from "@/components/attendance/management/EmployeeAvatar";
import { distanceMeters } from "@/lib/attendance/gate/geofence";
import { googleMapsEmbedUrl, googleMapsUrl } from "@/lib/geocode";
import { USER_ROLE_LABELS } from "@/lib/constants/labels";
import { formatDate, formatDateTime, formatTime, cn } from "@/lib/utils";
import { formatHHmmJerusalem } from "@/lib/attendance/management/edit-time";
import { canEditAttendanceTimes } from "@/lib/attendance/management/access";
import { MonthlyAttendanceTable } from "@/components/attendance/management/MonthlyAttendanceTable";
import { jerusalemYearMonth } from "@/lib/attendance/management/monthly-summary";
import { useApp } from "@/providers/AppProvider";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  ImageOff,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Phone,
  Smartphone,
  X,
} from "lucide-react";

type RangePreset = "day" | "week" | "month" | "year";

function rangeForPreset(preset: RangePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (preset === "day") start.setHours(0, 0, 0, 0);
  else if (preset === "week") start.setDate(start.getDate() - 6);
  else if (preset === "month") start.setDate(1);
  else start.setMonth(0, 1);
  return { from: start.toISOString().slice(0, 10), to };
}

function MapsButton({
  lat,
  lng,
}: {
  lat?: number | null;
  lng?: number | null;
}) {
  if (lat == null || lng == null) return null;
  return (
    <a
      href={googleMapsUrl(lat, lng)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      פתח ב־Google Maps
    </a>
  );
}

function EditedBadge({ meta }: { meta: AttendanceTimeEditMeta }) {
  const title = [
    meta.oldDisplay ? `שעה מקורית: ${meta.oldDisplay}` : "שעה מקורית: —",
    `שעה מתוקנת: ${meta.newDisplay}`,
    `נערך על ידי: ${meta.editedByName}`,
    formatDateTime(meta.editedAt),
  ].join("\n");
  return (
    <span
      title={title}
      className="inline-flex cursor-help items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
    >
      נערך
    </span>
  );
}

function PunchCard({
  kind,
  at,
  address,
  lat,
  lng,
  canEdit,
  editMeta,
  onSaveTime,
}: {
  kind: "in" | "out";
  at?: Date | string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  canEdit?: boolean;
  editMeta?: AttendanceTimeEditMeta | null;
  onSaveTime?: (hhmm: string) => Promise<void>;
}) {
  const isIn = kind === "in";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEdit = () => {
    setError(null);
    setValue(at ? formatHHmmJerusalem(new Date(at)) : "");
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (!onSaveTime) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveTime(value);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 space-y-3",
        isIn ? "border-emerald-200 bg-emerald-50/40" : "border-sky-200 bg-sky-50/40",
      )}
    >
      <div className="flex items-center gap-2">
        {isIn ? (
          <LogIn className="h-5 w-5 text-emerald-600" />
        ) : (
          <LogOut className="h-5 w-5 text-sky-600" />
        )}
        <h4 className="font-bold text-slate-900">{isIn ? "כניסה" : "יציאה"}</h4>
        {editMeta && <EditedBadge meta={editMeta} />}
      </div>
      {!at && !editing ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-slate-500">לא בוצעה {isIn ? "כניסה" : "יציאה"}</p>
          {canEdit && !isIn && onSaveTime && (
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              aria-label="הוסף שעת יציאה"
            >
              <Pencil className="h-3.5 w-3.5" />
              הוסף שעה
            </button>
          )}
        </div>
      ) : editing ? (
        <div className="space-y-2">
          <label className="block text-[11px] text-slate-500">שעה (HH:mm)</label>
          <input
            type="time"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            dir="ltr"
            autoFocus
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={cancel} disabled={saving}>
              <X className="h-3.5 w-3.5 ml-1" />
              ביטול
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || !value}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : null}
              שמור
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[11px] text-slate-500">שעה</p>
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-slate-900">{formatTime(at)}</p>
                {canEdit && onSaveTime && (
                  <button
                    type="button"
                    onClick={openEdit}
                    className="rounded p-1 text-slate-500 hover:bg-white/80 hover:text-slate-800"
                    aria-label={isIn ? "ערוך שעת כניסה" : "ערוך שעת יציאה"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">תאריך</p>
              <p className="font-bold text-slate-900">{formatDate(at)}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 mb-1">כתובת (GPS)</p>
            <p className="text-sm text-slate-800">
              {address?.trim() ||
                (lat != null && lng != null
                  ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                  : "לא זמינה")}
            </p>
            {lat != null && lng != null && (
              <p className="text-[11px] text-slate-400 mt-1 font-mono" dir="ltr">
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </p>
            )}
          </div>
          <MapsButton lat={lat} lng={lng} />
        </>
      )}
    </div>
  );
}

function PhotoPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 px-4 text-center">
      <ImageOff className="h-10 w-10 text-slate-300 mb-2" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function TechnicalDetails({ record }: { record: AttendanceManagementRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-800"
        onClick={() => setOpen((v) => !v)}
      >
        מידע טכני
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="p-4 space-y-2 text-xs text-slate-600 bg-white">
          <TechRow label="כתובת IP" value={record.ipAddress || "—"} ltr />
          <TechRow label="מערכת הפעלה" value={record.checkInDeviceOs || "—"} />
          <TechRow
            label="סוג מכשיר"
            value={record.checkInDeviceType || record.deviceInfo || "—"}
          />
          <TechRow label="דפדפן" value={record.checkInDeviceBrowser || "—"} />
          <TechRow label="מזהה מכשיר מהימן" value={record.trustedDeviceId || "—"} ltr />
          <TechRow label="מקור הפעולה" value={record.channelLabel || "—"} />
          <TechRow
            label="שיטה"
            value={record.method === "TRUSTED_DEVICE" ? "מכשיר מאושר" : record.method}
          />
          {record.notes && <TechRow label="הערות" value={record.notes} />}
          <div>
            <p className="text-slate-500 mb-1">User Agent</p>
            <p className="break-all rounded-lg bg-slate-50 p-2 font-mono" dir="ltr">
              {record.checkInUserAgent || "—"}
            </p>
          </div>
          {(record.isLate || !record.gpsValid) && (
            <div className="pt-2 space-y-1">
              {record.isLate && (
                <p className="text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  איחור בכניסה
                </p>
              )}
              {!record.gpsValid && (
                <p className="text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  GPS לא תקין
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TechRow({
  label,
  value,
  ltr,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-50 pb-1.5">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-medium text-slate-800", ltr && "font-mono")} dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}

export function EmployeeAttendanceCard({
  open,
  row,
  labGeo,
  onClose,
  onDevicesChanged,
  onAttendanceChanged,
}: {
  open: boolean;
  row: AttendanceEmployeeRosterRow | null;
  labGeo: AttendanceLabGeo;
  onClose: () => void;
  onDevicesChanged?: () => void;
  /** Refresh management table / KPIs after a time edit. */
  onAttendanceChanged?: () => void;
}) {
  const { currentUser } = useApp();
  const canEdit = Boolean(currentUser && canEditAttendanceTimes(currentUser));
  const [preset, setPreset] = useState<RangePreset>("month");
  const [records, setRecords] = useState<AttendanceManagementRecord[]>([]);
  const [stats, setStats] = useState<AttendanceEmployeeStats | null>(null);
  const [devices, setDevices] = useState<ConnectedDeviceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [tableReloadSignal, setTableReloadSignal] = useState(0);

  const defaultMonth = useMemo(() => jerusalemYearMonth(), []);

  const range = useMemo(() => rangeForPreset(preset), [preset]);

  const load = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    try {
      const [result, employeeStats, devicesRes] = await Promise.all([
        fetchAttendanceRecords({
          userId: row.employee.id,
          from: range.from,
          to: range.to,
          page: 1,
          limit: 200,
          sortBy: "checkIn",
          sortDir: "desc",
        }),
        fetchEmployeeAttendanceStats(row.employee.id, {
          from: range.from,
          to: range.to,
        }),
        fetch(
          `/api/attendance/trusted-devices?userId=${encodeURIComponent(row.employee.id)}`,
          { credentials: "include", cache: "no-store" },
        ).then((r) => r.json()),
      ]);
      if (result.mode === "records") {
        setRecords(result.records);
        setSelectedId((prev) =>
          prev && result.records.some((r) => r.id === prev)
            ? prev
            : (result.records[0]?.id ?? null),
        );
      } else {
        setRecords([]);
        setSelectedId(null);
      }
      setStats(employeeStats);
      setDevices(
        devicesRes?.success ? (devicesRes.data?.devices as ConnectedDeviceRow[]) ?? [] : [],
      );
    } catch {
      setRecords([]);
      setStats(null);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [row, range.from, range.to]);

  useEffect(() => {
    if (open && row) void load();
  }, [open, row, load]);

  const selected = records.find((r) => r.id === selectedId) ?? records[0] ?? null;

  const savePunchTime = async (field: "checkIn" | "checkOut", time: string) => {
    if (!selected) return;
    const updated = await patchAttendanceTime({
      recordId: selected.id,
      field,
      time,
    });
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (row) {
      const employeeStats = await fetchEmployeeAttendanceStats(row.employee.id, {
        from: range.from,
        to: range.to,
      });
      setStats(employeeStats);
    }
    setTableReloadSignal((n) => n + 1);
    onAttendanceChanged?.();
  };

  const mapUrl = useMemo(() => {
    if (!selected) return null;
    const inLat = selected.checkInLatitude ?? selected.latitude;
    const inLng = selected.checkInLongitude ?? selected.longitude;
    return mapEmbed(inLat, inLng, selected.checkOutLatitude, selected.checkOutLongitude);
  }, [selected]);

  const deviceAction = async (
    deviceId: string,
    action: "reset" | "delete" | "approve" | "block",
  ) => {
    setBusyDevice(deviceId);
    try {
      if (action === "delete") {
        if (!confirm("למחוק את המכשיר המאושר? העובד יידרש להירשם מחדש.")) return;
        await fetch(
          `/api/attendance/trusted-devices?deviceId=${encodeURIComponent(deviceId)}`,
          { method: "DELETE", credentials: "include" },
        );
      } else {
        const status =
          action === "reset" ? "REVOKED" : action === "block" ? "BLOCKED" : "ACTIVE";
        await fetch("/api/attendance/trusted-devices", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, status }),
        });
      }
      onDevicesChanged?.();
      await load();
    } finally {
      setBusyDevice(null);
    }
  };

  if (!row) return null;
  const emp = row.employee;
  const exportQuery = {
    userId: emp.id,
    from: range.from,
    to: range.to,
  };

  const inLat = selected?.checkInLatitude ?? selected?.latitude;
  const inLng = selected?.checkInLongitude ?? selected?.longitude;

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={`כרטסת נוכחות — ${emp.name}`}
        className="max-w-3xl"
      >
        <div className="space-y-5">
          <section className="flex items-start gap-3">
            <EmployeeAvatar name={emp.name} color={emp.color} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg text-slate-900">{emp.name}</p>
              <p className="text-sm text-slate-500">
                {USER_ROLE_LABELS[emp.role] ?? emp.role}
              </p>
              {emp.phone && (
                <p className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                  <Phone className="h-3.5 w-3.5" />
                  {emp.phone}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4 space-y-3">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-opal-gold" />
              מכשירים מאושרים
            </h3>
            {devices.length === 0 ? (
              <p className="text-sm text-slate-500">אין מכשירים מאושרים לעובד זה</p>
            ) : (
              <div className="space-y-2">
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border bg-slate-50 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {d.label || d.deviceType || "מכשיר"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {d.os || "—"} · {d.browser || "—"} ·{" "}
                        {d.status === "ACTIVE"
                          ? "מאושר"
                          : d.status === "BLOCKED"
                            ? "חסום"
                            : "בוטל"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        נרשם {formatDate(d.registeredAt)}
                        {d.lastUsedAt
                          ? ` · כניסה אחרונה ${formatDateTime(d.lastUsedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyDevice === d.id || d.status === "ACTIVE"}
                        onClick={() => void deviceAction(d.id, "approve")}
                      >
                        אישור מחדש
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyDevice === d.id}
                        onClick={() => void deviceAction(d.id, "reset")}
                      >
                        איפוס
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        disabled={busyDevice === d.id}
                        onClick={() => void deviceAction(d.id, "delete")}
                      >
                        מחיקה
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {stats && (
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "ימי עבודה", value: stats.workDays },
                { label: "שעות עבודה", value: stats.totalHours },
                { label: "שעות נוספות", value: stats.overtimeHours },
                { label: "איחורים", value: stats.lateCount },
                { label: "יציאות מוקדמות", value: stats.earlyLeaveCount },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border bg-white px-3 py-2">
                  <p className="text-[11px] text-slate-500">{s.label}</p>
                  <p className="text-lg font-bold text-slate-900">{s.value}</p>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-800">היסטוריית נוכחות</h3>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["day", "יום"],
                    ["week", "שבוע"],
                    ["month", "חודש"],
                    ["year", "שנה"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={preset === id ? "default" : "outline"}
                    onClick={() => setPreset(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(attendanceExportUrl(exportQuery, "csv"), "_blank")}
              >
                <FileSpreadsheet className="h-4 w-4 ml-1" />
                Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPdfPreviewUrl(attendanceExportUrl(exportQuery, "pdf"))}
              >
                <FileText className="h-4 w-4 ml-1" />
                PDF עובד
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-opal-gold" />
              </div>
            ) : records.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">אין רשומות בטווח שנבחר</p>
            ) : (
              <>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {records.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={cn(
                        "shrink-0 rounded-lg border px-3 py-1.5 text-xs",
                        selectedId === r.id
                          ? "border-opal-gold bg-opal-gold/10 font-semibold"
                          : "border-slate-200 hover:bg-slate-50",
                      )}
                    >
                      {formatDate(r.checkIn)} · {formatTime(r.checkIn)}
                      {r.durationHours != null ? ` · ${r.durationHours.toFixed(1)}ש׳` : ""}
                    </button>
                  ))}
                </div>

                {selected && (
                  <div className="space-y-4">
                    {selected.durationHours != null && (
                      <p className="text-sm text-slate-700">
                        סה״כ שעות לרשומה:{" "}
                        <span className="font-bold">{selected.durationHours.toFixed(2)}</span>
                      </p>
                    )}
                    <div className="grid sm:grid-cols-2 gap-3">
                      <PunchCard
                        kind="in"
                        at={selected.checkIn}
                        address={selected.checkInAddress}
                        lat={inLat}
                        lng={inLng}
                        canEdit={canEdit}
                        editMeta={selected.timeEdits?.checkIn}
                        onSaveTime={(time) => savePunchTime("checkIn", time)}
                      />
                      <PunchCard
                        kind="out"
                        at={selected.checkOut}
                        address={selected.checkOutAddress}
                        lat={selected.checkOutLatitude}
                        lng={selected.checkOutLongitude}
                        canEdit={canEdit}
                        editMeta={selected.timeEdits?.checkOut}
                        onSaveTime={(time) => savePunchTime("checkOut", time)}
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-opal-gold" />
                        מיקום GPS
                      </h4>
                      {inLat != null && inLng != null ? (
                        <>
                          <p className="text-sm text-slate-800">
                            {selected.checkInAddress?.trim() || "כתובת לא זמינה"}
                          </p>
                          <p className="text-xs font-mono text-slate-400" dir="ltr">
                            {inLat.toFixed(5)}, {inLng.toFixed(5)}
                          </p>
                          {labGeo.labLatitude != null && labGeo.labLongitude != null && (
                            <p className="text-xs text-slate-500">
                              מרחק מהמעבדה:{" "}
                              {Math.round(
                                distanceMeters(
                                  inLat,
                                  inLng,
                                  labGeo.labLatitude,
                                  labGeo.labLongitude,
                                ),
                              )}
                              מ׳
                            </p>
                          )}
                          <MapsButton lat={inLat} lng={inLng} />
                          {mapUrl && (
                            <iframe
                              title="מפת נוכחות"
                              src={mapUrl}
                              className="w-full h-44 rounded-xl border mt-2"
                              loading="lazy"
                              referrerPolicy="no-referrer-when-downgrade"
                            />
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-slate-500">אין נתוני GPS לרשומה זו</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
                      <h4 className="font-bold text-slate-900">תמונות</h4>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-slate-500 mb-2">תמונת כניסה</p>
                          <PhotoPlaceholder label="לא קיימת תמונת כניסה" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-2">תמונת יציאה</p>
                          <PhotoPlaceholder label="לא קיימת תמונת יציאה" />
                        </div>
                      </div>
                    </div>

                    <TechnicalDetails record={selected} />
                  </div>
                )}
              </>
            )}
          </section>

          <MonthlyAttendanceTable
            employeeId={emp.id}
            canEdit={canEdit}
            reloadSignal={tableReloadSignal}
            initialYear={defaultMonth.year}
            initialMonth={defaultMonth.month}
            onChanged={() => {
              setTableReloadSignal((n) => n + 1);
              void load();
              onAttendanceChanged?.();
            }}
          />
        </div>
      </Drawer>

      <AttendancePdfPreview
        open={Boolean(pdfPreviewUrl)}
        title={`PDF עובד – ${emp.name}`}
        url={pdfPreviewUrl}
        onClose={() => setPdfPreviewUrl(null)}
      />
    </>
  );
}

function mapEmbed(
  inLat?: number | null,
  inLng?: number | null,
  outLat?: number | null,
  outLng?: number | null,
): string | null {
  if (inLat != null && inLng != null && outLat != null && outLng != null) {
    return `https://maps.google.com/maps?saddr=${inLat},${inLng}&daddr=${outLat},${outLng}&output=embed`;
  }
  if (inLat != null && inLng != null) return googleMapsEmbedUrl(inLat, inLng);
  if (outLat != null && outLng != null) return googleMapsEmbedUrl(outLat, outLng);
  return null;
}
