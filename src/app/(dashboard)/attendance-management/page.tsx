"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { isAttendanceManager } from "@/lib/attendance/management/access";
import {
  attendanceExportUrl,
  fetchAttendanceKpis,
  fetchAttendanceRecords,
  fetchAttendanceRoster,
} from "@/lib/attendance/management/client";
import { AttendancePdfPreview } from "@/components/attendance/pdf/AttendancePdfPreview";
import type {
  AttendanceEmployeeRosterRow,
  AttendanceLabGeo,
  AttendanceManagementKpis,
  AttendanceManagementQuery,
  AttendanceManagementRecord,
} from "@/lib/attendance/management/types";
import { ANOMALY_LABELS } from "@/lib/attendance/management/status";
import { AttendanceQrPanel } from "@/components/attendance/gate/AttendanceQrPanel";
import { EmployeeAttendanceCard } from "@/components/attendance/management/EmployeeAttendanceCard";
import { EmployeeAvatar } from "@/components/attendance/management/EmployeeAvatar";
import { ConnectedDevicesTab } from "@/components/attendance/management/ConnectedDevicesTab";
import { USER_ROLE_LABELS } from "@/lib/constants/labels";
import { googleMapsUrl } from "@/lib/geocode";
import { formatDate, formatDateTime, formatTime, cn } from "@/lib/utils";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Calendar,
  AlertTriangle,
  Loader2,
  RefreshCw,
  QrCode,
  Search,
  FileSpreadsheet,
  FileText,
  MapPin,
  Eye,
  Smartphone,
} from "lucide-react";

type TabId = "records" | "employees" | "devices";

function defaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

function applyReportPreset(
  preset: "day" | "week" | "month" | "year",
): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (preset === "day") start.setHours(0, 0, 0, 0);
  else if (preset === "week") start.setDate(start.getDate() - 6);
  else if (preset === "month") start.setDate(1);
  else start.setMonth(0, 1);
  return { from: start.toISOString().slice(0, 10), to };
}

function statusBadge(record: AttendanceManagementRecord) {
  if (record.complianceStatus === "ok") {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">
        תקין
      </span>
    );
  }
  if (record.complianceStatus === "missing") {
    return (
      <span className="inline-flex rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
        חסר
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-[11px] font-medium">
      חריג
    </span>
  );
}

function GpsLink({
  lat,
  lng,
  label,
  address,
}: {
  lat?: number | null;
  lng?: number | null;
  label: string;
  address?: string | null;
}) {
  if (lat == null || lng == null) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <a
      href={googleMapsUrl(lat, lng)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex flex-col items-start gap-0.5 text-xs text-sky-700 hover:underline max-w-[140px]"
      onClick={(e) => e.stopPropagation()}
      title={address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
    >
      <span className="inline-flex items-center gap-1">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        {label}
      </span>
      {address?.trim() && (
        <span className="text-[10px] text-slate-500 line-clamp-2 text-right w-full">
          {address.trim()}
        </span>
      )}
    </a>
  );
}

export default function AttendanceManagementPage() {
  const router = useRouter();
  const { currentUser, users } = useApp();
  const [tab, setTab] = useState<TabId>("records");
  const [kpis, setKpis] = useState<AttendanceManagementKpis | null>(null);
  const [roster, setRoster] = useState<AttendanceEmployeeRosterRow[]>([]);
  const [labGeo, setLabGeo] = useState<AttendanceLabGeo>({
    labLatitude: null,
    labLongitude: null,
    geofenceRadiusMeters: 120,
    geofenceEnabled: false,
  });
  const [records, setRecords] = useState<AttendanceManagementRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AttendanceEmployeeRosterRow | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const [filters, setFilters] = useState<AttendanceManagementQuery>(() => ({
    ...defaultDateRange(),
    page: 1,
    limit: 25,
    sortBy: "checkIn",
    sortDir: "desc",
  }));

  const employees = useMemo(
    () => users.filter((u) => u.role !== "DOCTOR" && u.isActive),
    [users],
  );

  useEffect(() => {
    if (!currentUser) return;
    if (!isAttendanceManager(currentUser)) router.replace("/dashboard");
  }, [currentUser, router]);

  const loadShell = useCallback(async () => {
    const [kpiData, rosterData] = await Promise.all([
      fetchAttendanceKpis(),
      fetchAttendanceRoster(),
    ]);
    setKpis(kpiData);
    setRoster(rosterData.roster);
    setLabGeo(rosterData.labGeo);
    setSelected((prev) => {
      if (!prev) return null;
      return rosterData.roster.find((r) => r.employee.id === prev.employee.id) ?? null;
    });
  }, []);

  const loadRecords = useCallback(async () => {
    const result = await fetchAttendanceRecords(filters);
    if (result.mode === "records") {
      setRecords(result.records);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } else {
      setRecords([]);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    }
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadShell(), loadRecords()]);
    } catch {
      /* keep */
    } finally {
      setLoading(false);
    }
  }, [loadShell, loadRecords]);

  useEffect(() => {
    if (currentUser && isAttendanceManager(currentUser)) void load();
  }, [currentUser, load]);

  const kpiCards = useMemo(
    () => [
      { label: "נוכחים עכשיו", value: kpis?.presentNow ?? "—", icon: UserCheck, color: "text-emerald-600" },
      { label: "יצאו היום", value: kpis?.finishedToday ?? "—", icon: Users, color: "text-sky-600" },
      { label: "לא הגיעו", value: kpis?.notCheckedInToday ?? "—", icon: UserX, color: "text-slate-600" },
      { label: "איחורים היום", value: kpis?.lateToday ?? "—", icon: AlertTriangle, color: "text-amber-600" },
      { label: "שעות היום", value: kpis?.hoursToday ?? "—", icon: Clock, color: "text-indigo-600" },
      { label: "שעות החודש", value: kpis?.hoursMonth ?? "—", icon: Calendar, color: "text-violet-600" },
    ],
    [kpis],
  );

  const openEmployee = (userId: string) => {
    const row = roster.find((r) => r.employee.id === userId);
    if (row) setSelected(row);
  };

  const setDeviceStatus = async (
    deviceId: string,
    status: "ACTIVE" | "BLOCKED" | "REVOKED",
  ) => {
    setBusyId(deviceId);
    try {
      await fetch("/api/attendance/trusted-devices", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, status }),
      });
      await loadShell();
    } finally {
      setBusyId(null);
    }
  };

  const removeDevice = async (deviceId: string) => {
    if (!confirm("למחוק את המכשיר המאושר?")) return;
    setBusyId(deviceId);
    try {
      await fetch(`/api/attendance/trusted-devices?deviceId=${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadShell();
    } finally {
      setBusyId(null);
    }
  };

  if (!currentUser || !isAttendanceManager(currentUser)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-opal-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header title="ניהול נוכחות" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">בקרת נוכחות מלאה — דיווחים, GPS, מכשירים וחריגות</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setQrOpen((v) => !v)}>
            <QrCode className="h-4 w-4 ml-1" />
            {qrOpen ? "הסתר QR" : "QR לנוכחות"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 ml-1", loading && "animate-spin")} />
            רענון
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">{k.label}</p>
                  <Icon className={cn("h-4 w-4", k.color)} />
                </div>
                <p className="text-2xl font-bold mt-2 text-slate-900">{k.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {qrOpen && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h2 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
              <QrCode className="h-5 w-5 text-opal-gold" />
              QR לנוכחות
            </h2>
            <AttendanceQrPanel showUrl={false} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={tab === "records" ? "default" : "outline"}
              onClick={() => setTab("records")}
            >
              דיווחי נוכחות
            </Button>
            <Button
              size="sm"
              variant={tab === "devices" ? "default" : "outline"}
              onClick={() => setTab("devices")}
            >
              <Smartphone className="h-4 w-4 ml-1" />
              מכשירים מחוברים
            </Button>
            <Button
              size="sm"
              variant={tab === "employees" ? "default" : "outline"}
              onClick={() => setTab("employees")}
            >
              עובדים
            </Button>
          </div>

          {tab !== "devices" && (
          <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">עובד</Label>
              <Select
                value={filters.userId ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, userId: e.target.value || undefined, page: 1 }))
                }
              >
                <option value="">הכל</option>
                {employees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-xs">מתאריך</Label>
              <Input
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))}
              />
            </div>
            <div>
              <Label className="text-xs">עד תאריך</Label>
              <Input
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))}
              />
            </div>
            <div>
              <Label className="text-xs">סטטוס</Label>
              <Select
                value={filters.compliance ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    compliance: (e.target.value || undefined) as AttendanceManagementQuery["compliance"],
                    page: 1,
                  }))
                }
              >
                <option value="">הכל</option>
                <option value="ok">תקין</option>
                <option value="missing">חסר</option>
                <option value="anomaly">חריג</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">חיפוש</Label>
              <div className="relative">
                <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pr-9"
                  placeholder="שם עובד / מזהה / כתובת..."
                  value={filters.search ?? ""}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value || undefined, page: 1 }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={Boolean(filters.lateOnly)}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, lateOnly: e.target.checked || undefined, page: 1 }))
                }
              />
              איחורים בלבד
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={Boolean(filters.overtimeOnly)}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, overtimeOnly: e.target.checked || undefined, page: 1 }))
                }
              />
              שעות נוספות בלבד
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={Boolean(filters.anomaliesOnly)}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    anomaliesOnly: e.target.checked || undefined,
                    page: 1,
                  }))
                }
              />
              חריגות בלבד
            </label>
            <div className="flex-1" />
            {(["day", "week", "month", "year"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant="outline"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    ...applyReportPreset(p),
                    page: 1,
                  }))
                }
              >
                {p === "day" ? "יומי" : p === "week" ? "שבועי" : p === "month" ? "חודשי" : "שנתי"}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(attendanceExportUrl(filters, "csv"), "_blank")}
            >
              <FileSpreadsheet className="h-4 w-4 ml-1" />
              Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPdfPreviewUrl(attendanceExportUrl(filters, "pdf"))}
            >
              <FileText className="h-4 w-4 ml-1" />
              PDF כללי
            </Button>
          </div>
          </>
          )}
        </CardContent>
      </Card>

      {tab === "devices" && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <ConnectedDevicesTab
              onOpenEmployee={(userId) => {
                openEmployee(userId);
              }}
            />
          </CardContent>
        </Card>
      )}

      {tab === "records" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-bold text-slate-900">טבלת נוכחות מרכזית</h2>
              <p className="text-xs text-slate-500">{total} רשומות</p>
            </div>
            {loading && records.length === 0 ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-opal-gold" />
              </div>
            ) : records.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-12">אין דיווחים בטווח שנבחר</p>
            ) : (
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-medium px-3 py-3">עובד</th>
                    <th className="text-right font-medium px-3 py-3">תאריך</th>
                    <th className="text-right font-medium px-3 py-3">כניסה</th>
                    <th className="text-right font-medium px-3 py-3">יציאה</th>
                    <th className="text-right font-medium px-3 py-3">שעות</th>
                    <th className="text-right font-medium px-3 py-3">GPS</th>
                    <th className="text-right font-medium px-3 py-3">ערוץ</th>
                    <th className="text-right font-medium px-3 py-3">סטטוס</th>
                    <th className="text-right font-medium px-3 py-3">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t hover:bg-slate-50/80 cursor-pointer"
                      onClick={() => openEmployee(r.employee.id)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <EmployeeAvatar name={r.employee.name} color={r.employee.color} size="sm" />
                          <div>
                            <p className="font-medium text-slate-900">{r.employee.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {USER_ROLE_LABELS[r.employee.role]}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(r.checkIn)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatTime(r.checkIn)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.checkOut ? formatTime(r.checkOut) : "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.durationHours != null ? `${r.durationHours.toFixed(1)}` : "פתוח"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1">
                          <GpsLink
                            lat={r.checkInLatitude ?? r.latitude}
                            lng={r.checkInLongitude ?? r.longitude}
                            label="כניסה"
                            address={r.checkInAddress}
                          />
                          <GpsLink
                            lat={r.checkOutLatitude}
                            lng={r.checkOutLongitude}
                            label="יציאה"
                            address={r.checkOutAddress}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{r.channelLabel}</td>
                      <td className="px-3 py-2.5">
                        <div className="space-y-1">
                          {statusBadge(r)}
                          {r.anomalies.length > 0 && (
                            <p className="text-[10px] text-slate-500 max-w-[140px]">
                              {r.anomalies.map((a) => ANOMALY_LABELS[a]).join(" · ")}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" onClick={() => openEmployee(r.employee.id)}>
                          <Eye className="h-3.5 w-3.5 ml-1" />
                          כרטסת
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(filters.page ?? 1) <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                >
                  הקודם
                </Button>
                <span className="text-xs text-slate-500">
                  עמוד {filters.page ?? 1} מתוך {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(filters.page ?? 1) >= totalPages}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                >
                  הבא
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "employees" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b">
              <h2 className="font-bold text-slate-900">עובדים ומכשירים</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-right font-medium px-4 py-3">שם</th>
                  <th className="text-right font-medium px-3 py-3">תפקיד</th>
                  <th className="text-right font-medium px-3 py-3">מכשיר</th>
                  <th className="text-right font-medium px-3 py-3 hidden lg:table-cell">כניסה אחרונה</th>
                  <th className="text-right font-medium px-4 py-3">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((row) => (
                  <tr
                    key={row.employee.id}
                    className="border-t hover:bg-slate-50/80 cursor-pointer"
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar name={row.employee.name} color={row.employee.color} size="sm" />
                        <div>
                          <p className="font-medium">{row.employee.name}</p>
                          {row.isPresent && (
                            <span className="text-[11px] text-emerald-600">נוכח עכשיו</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {USER_ROLE_LABELS[row.employee.role]}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {row.deviceStatus === "NONE"
                        ? "ללא"
                        : row.deviceStatus === "ACTIVE"
                          ? "מאושר"
                          : row.deviceStatus === "BLOCKED"
                            ? "חסום"
                            : "בוטל"}
                      {row.deviceLabel ? ` · ${row.deviceLabel}` : ""}
                    </td>
                    <td className="px-3 py-3 text-slate-600 hidden lg:table-cell">
                      {row.lastCheckIn ? formatDateTime(new Date(row.lastCheckIn)) : "—"}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
                          כרטסת
                        </Button>
                        {row.deviceId && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === row.deviceId}
                              onClick={() => void setDeviceStatus(row.deviceId!, "REVOKED")}
                            >
                              איפוס
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              disabled={busyId === row.deviceId}
                              onClick={() => void removeDevice(row.deviceId!)}
                            >
                              מחיקה
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <EmployeeAttendanceCard
        open={Boolean(selected)}
        row={selected}
        labGeo={labGeo}
        onClose={() => setSelected(null)}
        onDevicesChanged={() => void loadShell()}
      />

      <AttendancePdfPreview
        open={Boolean(pdfPreviewUrl)}
        title="PDF כללי – דוח נוכחות"
        url={pdfPreviewUrl}
        onClose={() => setPdfPreviewUrl(null)}
      />
    </div>
  );
}
