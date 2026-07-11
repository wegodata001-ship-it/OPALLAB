"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { isAttendanceManager } from "@/lib/attendance/management/access";
import {
  attendanceExportUrl,
  fetchActiveAttendance,
  fetchAttendanceKpis,
  fetchAttendanceRecords,
} from "@/lib/attendance/management/client";
import type {
  AttendanceActiveRecord,
  AttendanceManagementKpis,
  AttendanceManagementQuery,
  AttendanceManagementRecord,
} from "@/lib/attendance/management/types";
import { EmployeeAvatar } from "@/components/attendance/management/EmployeeAvatar";
import { LiveDuration } from "@/components/attendance/management/LiveDuration";
import { AttendancePhotoModal, type AttendancePhotoItem } from "@/components/attendance/management/AttendancePhotoModal";
import { AttendanceRecordDrawer } from "@/components/attendance/management/AttendanceRecordDrawer";
import { USER_ROLE_LABELS, ATTENDANCE_METHOD_LABELS } from "@/lib/constants/labels";
import { formatDate, formatTime } from "@/lib/utils";
import { printHtml } from "@/lib/export";
import type { UserRole } from "@/lib/types";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Calendar,
  BarChart3,
  FileSpreadsheet,
  FileText,
  Search,
  Loader2,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "active" | "records";

const STATUS_OPTIONS = [
  { value: "", label: "הכל" },
  { value: "present", label: "נוכח" },
  { value: "left", label: "יצא" },
  { value: "late", label: "מאחר" },
  { value: "not_checked_in", label: "לא נכנס" },
] as const;

const ROLE_OPTIONS: UserRole[] = [
  "SECRETARY",
  "DESIGNER",
  "PRINTER",
  "MILLING",
  "PROCESSING",
  "FINISH",
  "PACKAGING",
  "OWNER",
  "ADMIN",
];

function defaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

function PhotoThumb({
  url,
  label,
  onClick,
}: {
  url?: string | null;
  label: string;
  onClick: () => void;
}) {
  if (!url) {
    return <span className="inline-block min-w-[44px] text-center text-xs text-slate-400">—</span>;
  }
  return (
    <button
      type="button"
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="rounded-md border overflow-hidden hover:ring-2 ring-opal-gold/60 shrink-0"
    >
      <img src={url} alt={label} className="h-11 w-11 object-cover block" referrerPolicy="no-referrer" />
    </button>
  );
}

export default function AttendanceManagementPage() {
  const router = useRouter();
  const { currentUser, users } = useApp();
  const [tab, setTab] = useState<TabId>("active");
  const [kpis, setKpis] = useState<AttendanceManagementKpis | null>(null);
  const [active, setActive] = useState<AttendanceActiveRecord[]>([]);
  const [records, setRecords] = useState<AttendanceManagementRecord[]>([]);
  const [notCheckedIn, setNotCheckedIn] = useState<{ employee: { id: string; name: string; phone: string | null; role: UserRole } }[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [recordsMode, setRecordsMode] = useState<"records" | "not_checked_in">("records");

  const [filters, setFilters] = useState<AttendanceManagementQuery>(() => ({
    ...defaultDateRange(),
    page: 1,
    limit: 25,
    sortBy: "checkIn",
    sortDir: "desc",
  }));

  const [drawerRecord, setDrawerRecord] = useState<AttendanceManagementRecord | null>(null);
  const [photoModal, setPhotoModal] = useState<{ photos: AttendancePhotoItem[]; index: number } | null>(null);

  const employees = useMemo(
    () => users.filter((u) => u.role !== "DOCTOR" && u.isActive),
    [users],
  );

  useEffect(() => {
    if (!currentUser) return;
    if (!isAttendanceManager(currentUser)) {
      router.replace("/dashboard");
    }
  }, [currentUser, router]);

  const loadKpis = useCallback(async () => {
    const data = await fetchAttendanceKpis();
    setKpis(data);
  }, []);

  const loadActive = useCallback(async () => {
    const data = await fetchActiveAttendance({
      search: filters.search,
      userId: filters.userId,
      role: filters.role,
    });
    setActive(data);
  }, [filters.search, filters.userId, filters.role]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAttendanceRecords(filters);
      if (data.mode === "not_checked_in") {
        setRecordsMode("not_checked_in");
        setNotCheckedIn(data.employees);
        setRecords([]);
      } else {
        setRecordsMode("records");
        setNotCheckedIn([]);
        setRecords(data.records);
      }
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadKpis();
    const id = window.setInterval(() => void loadKpis(), 60_000);
    return () => window.clearInterval(id);
  }, [loadKpis]);

  useEffect(() => {
    if (tab === "active") void loadActive();
  }, [tab, loadActive]);

  useEffect(() => {
    if (tab === "records") void loadRecords();
  }, [tab, loadRecords]);

  useEffect(() => {
    if (tab !== "active") return;
    const id = window.setInterval(() => void loadActive(), 60_000);
    return () => window.clearInterval(id);
  }, [tab, loadActive]);

  const openSinglePhoto = (url: string | null | undefined, label: string) => {
    if (!url?.trim()) return;
    setPhotoModal({ photos: [{ url, label }], index: 0 });
  };

  const handleExport = async (format: "csv" | "pdf") => {
    if (format === "csv") {
      window.open(attendanceExportUrl(filters, "csv"), "_blank");
      return;
    }
    const res = await fetch(attendanceExportUrl(filters, "pdf"), { credentials: "include" });
    const html = await res.text();
    printHtml("דוח נוכחות", html);
  };

  if (!currentUser || !isAttendanceManager(currentUser)) return null;

  const kpiCards = kpis
    ? [
        { label: "עובדים נוכחים עכשיו", value: kpis.presentNow, icon: Users, color: "text-emerald-600" },
        { label: "עובדים שסיימו היום", value: kpis.finishedToday, icon: UserCheck, color: "text-blue-600" },
        { label: "עובדים שלא נכנסו", value: kpis.notCheckedInToday, icon: UserX, color: "text-amber-600" },
        { label: "שעות עבודה היום", value: kpis.hoursToday, icon: Clock, color: "text-opal-gold-dark" },
        { label: "שעות עבודה החודש", value: kpis.hoursMonth, icon: Calendar, color: "text-purple-600" },
        { label: "ממוצע שעות לעובד", value: kpis.avgHoursPerEmployee, icon: BarChart3, color: "text-slate-700" },
      ]
    : [];

  return (
    <>
      <Header title="ניהול נוכחות" description="מעקב נוכחות, GPS, תמונות אימות ומכשירים — מנהל בלבד" />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {kpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Icon className={cn("h-4 w-4", k.color)} />
                  {k.label}
                </div>
                <p className={cn("text-2xl font-bold", k.color)}>{k.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b pb-3">
        <Button variant={tab === "active" ? "default" : "outline"} onClick={() => setTab("active")}>
          עובדים נוכחים עכשיו
        </Button>
        <Button variant={tab === "records" ? "default" : "outline"} onClick={() => setTab("records")}>
          כל רישומי הנוכחות
        </Button>
      </div>

      {tab === "records" && (
        <Card className="mb-4">
          <CardContent className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <div>
              <Label className="text-xs">מתאריך</Label>
              <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilters((f) => ({ ...f, page: 1, from: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">עד תאריך</Label>
              <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilters((f) => ({ ...f, page: 1, to: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">עובד</Label>
              <select
                className="w-full h-10 rounded-md border px-2 text-sm"
                value={filters.userId ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, page: 1, userId: e.target.value || undefined }))}
              >
                <option value="">הכל</option>
                {employees.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">מחלקה / תפקיד</Label>
              <select
                className="w-full h-10 rounded-md border px-2 text-sm"
                value={filters.role ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, page: 1, role: (e.target.value as UserRole) || undefined }))}
              >
                <option value="">הכל</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">סטטוס</Label>
              <select
                className="w-full h-10 rounded-md border px-2 text-sm"
                value={filters.status ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, page: 1, status: (e.target.value as AttendanceManagementQuery["status"]) || undefined }))}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value || "all"} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">GPS</Label>
              <select
                className="w-full h-10 rounded-md border px-2 text-sm"
                value={filters.gps ?? "all"}
                onChange={(e) => setFilters((f) => ({ ...f, page: 1, gps: e.target.value as AttendanceManagementQuery["gps"] }))}
              >
                <option value="all">כל הרשומות</option>
                <option value="valid">GPS תקין</option>
                <option value="invalid">GPS לא תקין</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">תמונה</Label>
              <select
                className="w-full h-10 rounded-md border px-2 text-sm"
                value={filters.photo ?? "all"}
                onChange={(e) => setFilters((f) => ({ ...f, page: 1, photo: e.target.value as AttendanceManagementQuery["photo"] }))}
              >
                <option value="all">הכל</option>
                <option value="has">יש</option>
                <option value="none">אין</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">מיון</Label>
              <select
                className="w-full h-10 rounded-md border px-2 text-sm"
                value={filters.sortBy ?? "checkIn"}
                onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value as AttendanceManagementQuery["sortBy"] }))}
              >
                <option value="name">שם</option>
                <option value="checkIn">כניסה</option>
                <option value="checkOut">יציאה</option>
                <option value="duration">משך</option>
                <option value="date">תאריך</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">חיפוש חופשי</Label>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pr-9"
                  placeholder="שם, טלפון, כתובת..."
                  value={filters.search ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, page: 1, search: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2 md:col-span-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleExport("csv")}>
                <FileSpreadsheet className="h-4 w-4 ml-1" /> Excel/CSV
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleExport("pdf")}>
                <FileText className="h-4 w-4 ml-1" /> PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "active" && (
        <>
          <div className="hidden lg:block overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3 text-right">עובד</th>
                  <th className="p-3 text-right">מחלקה</th>
                  <th className="p-3 text-right">כניסה</th>
                  <th className="p-3 text-right">זמן בעבודה</th>
                  <th className="p-3 text-right">GPS</th>
                  <th className="p-3 text-right">תמונה</th>
                  <th className="p-3 text-right">סטטוס</th>
                  <th className="p-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50/80">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar name={r.employee.name} color={r.employee.color} size="sm" />
                        <span className="font-medium">{r.employee.name}</span>
                      </div>
                    </td>
                    <td className="p-3">{USER_ROLE_LABELS[r.employee.role]}</td>
                    <td className="p-3">{formatTime(r.checkIn)}</td>
                    <td className="p-3"><LiveDuration since={r.checkIn} /></td>
                    <td className="p-3 text-xs">
                      <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.checkInAddress || "אין נתונים"}</p>
                      {r.checkInAccuracy != null && <p>±{Math.round(r.checkInAccuracy)} מ׳</p>}
                    </td>
                    <td className="p-3">
                      <PhotoThumb
                        url={r.checkInPhotoUrl}
                        label="צילום כניסה"
                        onClick={() => openSinglePhoto(r.checkInPhotoUrl, "צילום כניסה")}
                      />
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-medium">נוכח</span>
                    </td>
                    <td className="p-3">
                      <Button type="button" size="sm" variant="outline" onClick={() => setDrawerRecord(r)}>פרטים</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {active.length === 0 && <p className="text-center text-slate-400 py-10">אין עובדים פעילים כרגע</p>}
          </div>

          <div className="lg:hidden space-y-3">
            {active.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <EmployeeAvatar name={r.employee.name} color={r.employee.color} />
                    <div>
                      <p className="font-bold">{r.employee.name}</p>
                      <p className="text-xs text-slate-500">{USER_ROLE_LABELS[r.employee.role]}</p>
                    </div>
                    <span className="mr-auto text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">נוכח</span>
                  </div>
                  <p>כניסה: {formatTime(r.checkIn)} · <LiveDuration since={r.checkIn} /></p>
                  <p className="text-xs text-slate-600">{r.checkInAddress || "אין נתונים"}</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    <PhotoThumb
                      url={r.checkInPhotoUrl}
                      label="צילום כניסה"
                      onClick={() => openSinglePhoto(r.checkInPhotoUrl, "צילום כניסה")}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => setDrawerRecord(r)}>פרטי הרשומה</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === "records" && (
        <>
          {loading && (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-opal-gold" /></div>
          )}

          {!loading && recordsMode === "not_checked_in" && (
            <div className="rounded-xl border bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr><th className="p-3 text-right">שם</th><th className="p-3 text-right">טלפון</th><th className="p-3 text-right">תפקיד</th><th className="p-3 text-right">סטטוס</th></tr></thead>
                <tbody>
                  {notCheckedIn.map((row) => (
                    <tr key={row.employee.id} className="border-t">
                      <td className="p-3 font-medium">{row.employee.name}</td>
                      <td className="p-3">{row.employee.phone || "—"}</td>
                      <td className="p-3">{USER_ROLE_LABELS[row.employee.role]}</td>
                      <td className="p-3"><span className="text-amber-700 text-xs font-medium">לא נכנס היום</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && recordsMode === "records" && (
            <>
              <div className="hidden lg:block overflow-x-auto rounded-xl border bg-white">
                <table className="w-full text-sm min-w-[1400px]">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-2 text-right whitespace-nowrap">עובד</th>
                      <th className="p-2 text-right whitespace-nowrap">תאריך</th>
                      <th className="p-2 text-right whitespace-nowrap">כניסה</th>
                      <th className="p-2 text-right whitespace-nowrap">יציאה</th>
                      <th className="p-2 text-right whitespace-nowrap">משך</th>
                      <th className="p-2 text-right whitespace-nowrap">כתובת כניסה</th>
                      <th className="p-2 text-right whitespace-nowrap">כתובת יציאה</th>
                      <th className="p-2 text-right whitespace-nowrap">דיוק GPS</th>
                      <th className="p-2 text-right whitespace-nowrap">מכשיר</th>
                      <th className="p-2 text-right whitespace-nowrap">שיטה</th>
                      <th className="p-2 text-right whitespace-nowrap min-w-[56px]">תמונת כניסה</th>
                      <th className="p-2 text-right whitespace-nowrap min-w-[56px]">תמונת יציאה</th>
                      <th className="p-2 text-right whitespace-nowrap" />
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-slate-50/80">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <EmployeeAvatar name={r.employee.name} color={r.employee.color} size="sm" />
                            {r.employee.name}
                          </div>
                        </td>
                        <td className="p-2">{formatDate(r.checkIn)}</td>
                        <td className="p-2">{formatTime(r.checkIn)}</td>
                        <td className="p-2">{r.checkOut ? formatTime(r.checkOut) : "—"}</td>
                        <td className="p-2">{r.durationHours != null ? `${r.durationHours.toFixed(1)} ש׳` : r.checkOut ? "—" : "פעיל"}</td>
                        <td className="p-2 max-w-[140px] truncate" title={r.checkInAddress ?? ""}>{r.checkInAddress || "אין נתונים"}</td>
                        <td className="p-2 max-w-[140px] truncate">{r.checkOutAddress || "—"}</td>
                        <td className="p-2">{r.checkInAccuracy != null ? `±${Math.round(r.checkInAccuracy)}m` : "—"}</td>
                        <td className="p-2 text-xs">{[r.checkInDeviceBrowser, r.checkInDeviceOs, r.checkInDeviceType].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="p-2">{ATTENDANCE_METHOD_LABELS[r.method]}</td>
                        <td className="p-2">
                          <PhotoThumb
                            url={r.checkInPhotoUrl}
                            label="צילום כניסה"
                            onClick={() => openSinglePhoto(r.checkInPhotoUrl, "צילום כניסה")}
                          />
                        </td>
                        <td className="p-2">
                          <PhotoThumb
                            url={r.checkOutPhotoUrl}
                            label="צילום יציאה"
                            onClick={() => openSinglePhoto(r.checkOutPhotoUrl, "צילום יציאה")}
                          />
                        </td>
                        <td className="p-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setDrawerRecord(r)}>פרטים</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden space-y-3">
                {records.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="p-4 space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar name={r.employee.name} color={r.employee.color} size="sm" />
                        <p className="font-bold">{r.employee.name}</p>
                      </div>
                      <p>{formatDate(r.checkIn)} · {formatTime(r.checkIn)} → {r.checkOut ? formatTime(r.checkOut) : "פעיל"}</p>
                      <p className="text-xs text-slate-600">{r.checkInAddress || "אין נתונים"}</p>
                      <div className="flex flex-wrap gap-2 items-center">
                        <PhotoThumb
                          url={r.checkInPhotoUrl}
                          label="צילום כניסה"
                          onClick={() => openSinglePhoto(r.checkInPhotoUrl, "צילום כניסה")}
                        />
                        <PhotoThumb
                          url={r.checkOutPhotoUrl}
                          label="צילום יציאה"
                          onClick={() => openSinglePhoto(r.checkOutPhotoUrl, "צילום יציאה")}
                        />
                        <Button size="sm" variant="outline" onClick={() => setDrawerRecord(r)}>פרטים</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-slate-500">סה״כ {total} רשומות</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(filters.page ?? 1) <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                  >
                    הקודם
                  </Button>
                  <span className="text-sm self-center">{filters.page} / {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(filters.page ?? 1) >= totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  >
                    הבא
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <AttendanceRecordDrawer
        open={Boolean(drawerRecord)}
        onClose={() => setDrawerRecord(null)}
        record={drawerRecord}
        onOpenPhoto={(url, label) => openSinglePhoto(url, label)}
      />
      <AttendancePhotoModal
        open={Boolean(photoModal)}
        onClose={() => setPhotoModal(null)}
        photos={photoModal?.photos ?? []}
        startIndex={photoModal?.index}
      />
    </>
  );
}
