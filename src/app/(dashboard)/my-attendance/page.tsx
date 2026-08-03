"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { LiveDuration } from "@/components/attendance/management/LiveDuration";
import { fetchMyAttendance } from "@/lib/attendance/employee/client";
import { formatEmployeeDuration } from "@/lib/attendance/employee/format";
import type { EmployeeAttendanceQuery, EmployeeAttendanceResult } from "@/lib/attendance/employee/types";
import { myAttendancePdfUrl } from "@/lib/attendance/pdf/client";
import { AttendancePdfPreview } from "@/components/attendance/pdf/AttendancePdfPreview";
import { formatDate, formatTime } from "@/lib/utils";
import { Calendar, Clock, TrendingUp, Briefcase, Loader2, ChevronRight, ChevronLeft, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

function defaultFilters(): EmployeeAttendanceQuery {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    page: 1,
    limit: 20,
    sortDir: "desc",
  };
}

function StatusBadge({ status }: { status: "open" | "closed" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "open" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
      )}
    >
      {status === "open" ? "פתוחה" : "הסתיימה"}
    </span>
  );
}

export default function MyAttendancePage() {
  const [filters, setFilters] = useState<EmployeeAttendanceQuery>(defaultFilters);
  const [draft, setDraft] = useState(() => ({
    from: "",
    to: "",
    month: String(defaultFilters().month),
    year: String(defaultFilters().year),
  }));
  const [data, setData] = useState<EmployeeAttendanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async (query: EmployeeAttendanceQuery) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMyAttendance(query);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת הנתונים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const applyFilters = () => {
    const month = draft.month ? Number(draft.month) : undefined;
    const year = draft.year ? Number(draft.year) : undefined;
    const useMonthYear = month && year && !draft.from && !draft.to;

    setFilters({
      from: draft.from || undefined,
      to: draft.to || undefined,
      month: useMonthYear ? month : undefined,
      year: useMonthYear ? year : undefined,
      page: 1,
      limit: filters.limit ?? 20,
      sortDir: "desc",
    });
  };

  const summary = data?.summary;
  const openRecord = data?.openRecord;

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: new Intl.DateTimeFormat("he-IL", { month: "long" }).format(new Date(2024, i, 1)),
    }));
  }, []);

  return (
    <>
      <Header
        title="הנוכחות שלי"
        description="היסטוריית הנוכחות האישית — לצפייה בלבד"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPdfPreviewUrl(myAttendancePdfUrl(filters))}
            >
              <FileText className="h-4 w-4 ml-1" />
              PDF
            </Button>
            <Link href="/my-work">
              <Button variant="outline" size="sm">רישום כניסה / יציאה</Button>
            </Link>
          </div>
        }
      />

      {openRecord && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50/60">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-800">נמצא כעת במשמרת</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                כניסה: {formatDate(openRecord.checkIn)} · {formatTime(openRecord.checkIn)}
              </p>
            </div>
            <div className="text-lg">
              <LiveDuration since={openRecord.checkIn} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-8 w-8 text-blue-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{summary?.workDays ?? "—"}</p>
              <p className="text-xs text-slate-500">ימי עבודה</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-opal-gold shrink-0" />
            <div>
              <p className="text-2xl font-bold">{summary ? summary.totalHours.toFixed(1) : "—"}</p>
              <p className="text-xs text-slate-500">שעות עבודה</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-amber-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{summary ? summary.overtimeHours.toFixed(1) : "—"}</p>
              <p className="text-xs text-slate-500">שעות נוספות</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Briefcase className="h-8 w-8 text-purple-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold">{summary ? summary.averageHoursPerDay.toFixed(1) : "—"}</p>
              <p className="text-xs text-slate-500">ממוצע שעות ליום</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">סינון</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <Label htmlFor="from">מתאריך</Label>
            <Input id="from" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="to">עד תאריך</Label>
            <Input id="to" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="month">חודש</Label>
            <select
              id="month"
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              value={draft.month}
              onChange={(e) => setDraft((d) => ({ ...d, month: e.target.value }))}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="year">שנה</Label>
            <Input id="year" type="number" min={2020} max={2100} value={draft.year} onChange={(e) => setDraft((d) => ({ ...d, year: e.target.value }))} />
          </div>
          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={applyFilters}>החל</Button>
            <Button
              variant="outline"
              onClick={() => {
                const d = defaultFilters();
                setDraft({ from: "", to: "", month: String(d.month), year: String(d.year) });
                setFilters(d);
              }}
            >
              איפוס
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">יומן נוכחות</CardTitle>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          {!loading && data && data.records.length === 0 && (
            <p className="text-center text-slate-400 py-12">אין רשומות בטווח שנבחר</p>
          )}

          {data && data.records.length > 0 && (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-right">
                      <th className="p-3 font-medium">תאריך</th>
                      <th className="p-3 font-medium">יום</th>
                      <th className="p-3 font-medium">כניסה</th>
                      <th className="p-3 font-medium">יציאה</th>
                      <th className="p-3 font-medium">משך</th>
                      <th className="p-3 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="p-3">{formatDate(r.checkIn)}</td>
                        <td className="p-3">{r.weekday}</td>
                        <td className="p-3 font-mono">{formatTime(r.checkIn)}</td>
                        <td className="p-3 font-mono">{r.checkOut ? formatTime(r.checkOut) : "—"}</td>
                        <td className="p-3">
                          {r.status === "open" ? <LiveDuration since={r.checkIn} /> : formatEmployeeDuration(r.durationHours)}
                        </td>
                        <td className="p-3"><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {data.records.map((r) => (
                  <div key={r.id} className="rounded-xl border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{formatDate(r.checkIn)}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-slate-500">{r.weekday}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-slate-400">כניסה</p>
                        <p className="font-mono">{formatTime(r.checkIn)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">יציאה</p>
                        <p className="font-mono">{r.checkOut ? formatTime(r.checkOut) : "—"}</p>
                      </div>
                    </div>
                    <div className="pt-1 border-t text-sm">
                      <span className="text-slate-500">משך: </span>
                      {r.status === "open" ? <LiveDuration since={r.checkIn} /> : formatEmployeeDuration(r.durationHours)}
                    </div>
                  </div>
                ))}
              </div>

              {data.totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                  >
                    <ChevronRight className="h-4 w-4" />
                    הקודם
                  </Button>
                  <span className="text-sm text-slate-500">
                    עמוד {data.page} מתוך {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page >= data.totalPages}
                    onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                  >
                    הבא
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AttendancePdfPreview
        open={Boolean(pdfPreviewUrl)}
        title="PDF – הנוכחות שלי"
        url={pdfPreviewUrl}
        onClose={() => setPdfPreviewUrl(null)}
      />
    </>
  );
}
