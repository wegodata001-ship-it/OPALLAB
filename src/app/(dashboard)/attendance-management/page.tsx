"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/providers/AppProvider";
import { isAttendanceManager } from "@/lib/attendance/management/access";
import {
  fetchAttendanceKpis,
  fetchAttendanceRoster,
} from "@/lib/attendance/management/client";
import type {
  AttendanceEmployeeRosterRow,
  AttendanceLabGeo,
  AttendanceManagementKpis,
} from "@/lib/attendance/management/types";
import { AttendanceQrPanel } from "@/components/attendance/gate/AttendanceQrPanel";
import { EmployeeAttendanceCard } from "@/components/attendance/management/EmployeeAttendanceCard";
import { EmployeeAvatar } from "@/components/attendance/management/EmployeeAvatar";
import { USER_ROLE_LABELS } from "@/lib/constants/labels";
import { formatDateTime } from "@/lib/utils";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEVICE_STATUS_LABEL: Record<AttendanceEmployeeRosterRow["deviceStatus"], string> = {
  NONE: "ללא מכשיר",
  ACTIVE: "מאושר",
  BLOCKED: "חסום",
  REVOKED: "בוטל",
};

export default function AttendanceManagementPage() {
  const router = useRouter();
  const { currentUser } = useApp();
  const [kpis, setKpis] = useState<AttendanceManagementKpis | null>(null);
  const [roster, setRoster] = useState<AttendanceEmployeeRosterRow[]>([]);
  const [labGeo, setLabGeo] = useState<AttendanceLabGeo>({
    labLatitude: null,
    labLongitude: null,
    geofenceRadiusMeters: 120,
    geofenceEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AttendanceEmployeeRosterRow | null>(null);
  const [qrOpen, setQrOpen] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    if (!isAttendanceManager(currentUser)) {
      router.replace("/dashboard");
    }
  }, [currentUser, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
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
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

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
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const removeDevice = async (deviceId: string) => {
    if (!confirm("למחוק את המכשיר המאושר? העובד יידרש להירשם מחדש.")) return;
    setBusyId(deviceId);
    try {
      await fetch(`/api/attendance/trusted-devices?deviceId=${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      await load();
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

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">QR, מכשירים וכרטסות עובדים — במקום אחד</p>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 ml-1", loading && "animate-spin")} />
          רענון
        </Button>
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

      <Card>
        <CardContent className="p-4 sm:p-6">
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 text-right"
            onClick={() => setQrOpen((v) => !v)}
          >
            <span className="font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="h-5 w-5 text-opal-gold" />
              QR לנוכחות
            </span>
            <span className="text-sm text-slate-500">{qrOpen ? "הסתר" : "הצג"}</span>
          </button>
          {qrOpen && (
            <div className="mt-4">
              <AttendanceQrPanel />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-bold text-slate-900">עובדים ומכשירים</h2>
            <p className="text-xs text-slate-500">לחיצה על שורה פותחת כרטסת נוכחות</p>
          </div>
          {loading && roster.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-opal-gold" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-right font-medium px-4 py-3">שם עובד</th>
                  <th className="text-right font-medium px-3 py-3">תפקיד</th>
                  <th className="text-right font-medium px-3 py-3">סטטוס מכשיר</th>
                  <th className="text-right font-medium px-3 py-3 hidden md:table-cell">מכשיר אחרון</th>
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
                          <p className="font-medium text-slate-900">{row.employee.name}</p>
                          {row.isPresent && (
                            <span className="text-[11px] text-emerald-600 font-medium">נוכח עכשיו</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {USER_ROLE_LABELS[row.employee.role] ?? row.employee.role}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          row.deviceStatus === "ACTIVE" && "bg-emerald-50 text-emerald-700",
                          row.deviceStatus === "BLOCKED" && "bg-red-50 text-red-700",
                          row.deviceStatus === "REVOKED" && "bg-amber-50 text-amber-800",
                          row.deviceStatus === "NONE" && "bg-slate-100 text-slate-600",
                        )}
                      >
                        {DEVICE_STATUS_LABEL[row.deviceStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600 hidden md:table-cell">
                      {row.deviceLabel || row.deviceOs || "—"}
                    </td>
                    <td className="px-3 py-3 text-slate-600 hidden lg:table-cell">
                      {row.lastCheckIn ? formatDateTime(new Date(row.lastCheckIn)) : "—"}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1">
                        {row.deviceId ? (
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
                              disabled={busyId === row.deviceId}
                              onClick={() => void setDeviceStatus(row.deviceId!, "ACTIVE")}
                            >
                              אישור
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
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <EmployeeAttendanceCard
        open={Boolean(selected)}
        row={selected}
        labGeo={labGeo}
        onClose={() => setSelected(null)}
        onDevicesChanged={() => void load()}
      />
    </div>
  );
}
