"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select, Input } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { USER_ROLE_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants/labels";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { calculateEmployeePay, getSalaryLabel } from "@/lib/salary";
import { LAB_GEOFENCE, isInsidePolygon } from "@/lib/geofence";
import { isSystemAdmin } from "@/lib/permissions";
import { Clock, CheckCircle2, Wallet, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRODUCTION_STAGES,
  getStagesForRole,
  ROLE_PERMISSIONS_SUMMARY,
} from "@/lib/workflow-permissions";
import type { OrderStatus } from "@/lib/types";

const STAGE_LABELS = Object.fromEntries(PRODUCTION_STAGES.map((s) => [s.status, s.label])) as Record<OrderStatus, string>;

export default function MyWorkPage() {
  const { currentUser, attendance, orders, checkIn, checkOut, getActiveAttendance, labSettings } = useApp();
  const [message, setMessage] = useState("");
  const [selectedWifi, setSelectedWifi] = useState("");
  const [geoOk, setGeoOk] = useState<boolean | null>(null);
  const [attendanceCode, setAttendanceCode] = useState("");

  useEffect(() => {
    if (!labSettings.requireGeofence) { setGeoOk(true); return; }
    if (!navigator.geolocation) { setGeoOk(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeoOk(isInsidePolygon({ lat: pos.coords.latitude, lng: pos.coords.longitude }, LAB_GEOFENCE)),
      () => setGeoOk(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [labSettings.requireGeofence]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const myAttendance = useMemo(() =>
    attendance
      .filter((a) => a.userId === currentUser?.id && a.checkIn >= monthStart)
      .sort((a, b) => b.checkIn.getTime() - a.checkIn.getTime()),
  [attendance, currentUser?.id, monthStart]);

  const totalHours = myAttendance.reduce((sum, a) => {
    if (!a.checkOut) return sum;
    return sum + (a.checkOut.getTime() - a.checkIn.getTime()) / 3600000;
  }, 0);

  const isActive = currentUser ? getActiveAttendance().some((a) => a.userId === currentUser.id) : false;
  const myStages = currentUser ? getStagesForRole(currentUser) : [];

  const workReports = useMemo(() => {
    if (!currentUser) return [];
    const reports: { orderId: string; serialNumber: string; patientName: string; stage: OrderStatus; stageLabel: string; completedAt: Date }[] = [];
    for (const order of orders) {
      for (const stage of myStages) {
        const c = order.completedStages[stage];
        if (c?.completedBy === currentUser.id) {
          reports.push({
            orderId: order.id,
            serialNumber: order.serialNumber,
            patientName: order.patient.name,
            stage,
            stageLabel: STAGE_LABELS[stage] ?? ORDER_STATUS_LABELS[stage],
            completedAt: c.completedAt,
          });
        }
      }
    }
    return reports.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }, [orders, myStages, currentUser]);

  if (!currentUser) return null;

  const monthReports = workReports.filter((r) => r.completedAt >= monthStart);
  const estimatedPay = calculateEmployeePay(currentUser, totalHours);
  const adminBypass = isSystemAdmin(currentUser.role);

  const handleAttendance = () => {
    if (isActive) {
      checkOut(currentUser.id, "WIFI");
      setMessage(`יציאה נרשמה — ${formatDateTime(new Date())}`);
      return;
    }
    if (labSettings.wifiAttendanceEnabled && !adminBypass) {
      if (!selectedWifi || !labSettings.allowedWifiSsids.includes(selectedWifi)) {
        setMessage("יש לבחור רשת WiFi מורשית של המעבדה");
        return;
      }
      if (labSettings.requireGeofence && geoOk === false) {
        setMessage("יש להיות בתוך המעבדה (מיקום GPS) לרישום נוכחות");
        return;
      }
      if (labSettings.attendanceCode && attendanceCode !== labSettings.attendanceCode) {
        setMessage("קוד נוכחות שגוי");
        return;
      }
    }
    checkIn(currentUser.id, "WIFI", { wifiSsid: selectedWifi || undefined });
    setMessage(`כניסה נרשמה דרך ${selectedWifi || "WiFi"} — ${formatDateTime(new Date())}`);
  };

  return (
    <>
      <Header
        title="נוכחות ודיווחים"
        description={`${currentUser.name} · ${USER_ROLE_LABELS[currentUser.role]}`}
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
              <p className="text-xs text-slate-500">שעות החודש</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">{monthReports.length}</p>
              <p className="text-xs text-slate-500">דיווחי עבודה החודש</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-8 w-8 text-opal-gold" />
            <div>
              <p className="text-2xl font-bold text-opal-gold-dark">
                {estimatedPay != null ? formatCurrency(estimatedPay) : "—"}
              </p>
              <p className="text-xs text-slate-500">{getSalaryLabel(currentUser)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-opal-gold" />
              רישום נוכחות (WiFi)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={cn(
              "rounded-xl p-4 text-center",
              isActive ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50 border"
            )}>
              <p className="text-sm text-slate-600 mb-1">סטטוס נוכחי</p>
              <p className={cn("text-lg font-bold", isActive ? "text-emerald-700" : "text-slate-500")}>
                {isActive ? "במעבדה" : "לא נרשמה כניסה"}
              </p>
            </div>

            {labSettings.wifiAttendanceEnabled && !adminBypass && (
              <>
                <div>
                  <Label>רשת WiFi מורשית</Label>
                  <Select value={selectedWifi} onChange={(e) => setSelectedWifi(e.target.value)}>
                    <option value="">בחר רשת...</option>
                    {labSettings.allowedWifiSsids.map((ssid) => (
                      <option key={ssid} value={ssid}>{ssid}</option>
                    ))}
                  </Select>
                  <p className="text-xs text-slate-400 mt-1">יש להתחבר לרשת WiFi של המעבדה לפני רישום</p>
                </div>
                {labSettings.requireGeofence && (
                  <p className={cn("text-xs", geoOk ? "text-emerald-600" : geoOk === false ? "text-red-500" : "text-slate-400")}>
                    {geoOk === null ? "בודק מיקום GPS..." : geoOk ? "✓ מיקום במעבדה אומת" : "✗ לא במיקום המעבדה"}
                  </p>
                )}
                {labSettings.attendanceCode && (
                  <div>
                    <Label>קוד נוכחות</Label>
                    <Input value={attendanceCode} onChange={(e) => setAttendanceCode(e.target.value)} placeholder="קוד מהמזכירות" />
                  </div>
                )}
              </>
            )}

            <Button size="lg" className="w-full" onClick={handleAttendance}>
              {isActive ? "רישום יציאה" : "רישום כניסה"}
            </Button>
            {message && <p className={cn("text-sm text-center", message.includes("שגוי") || message.includes("יש") ? "text-red-600" : "text-emerald-600")}>{message}</p>}
            <p className="text-xs text-slate-400 text-center">
              ניתן גם לדווח דרך{" "}
              <Link href="/attendance" className="text-opal-gold-dark underline">עמדת NFC</Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>הרשאות התפקיד שלי</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 leading-relaxed">{ROLE_PERMISSIONS_SUMMARY[currentUser.role]}</p>
            {myStages.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {myStages.map((s) => (
                  <span key={s} className="px-2 py-1 rounded-lg bg-opal-gold/10 text-opal-gold-dark text-xs font-medium">
                    {STAGE_LABELS[s]}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>יומן נוכחות — החודש</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {myAttendance.map((a) => {
              const hours = a.checkOut
                ? ((a.checkOut.getTime() - a.checkIn.getTime()) / 3600000).toFixed(1)
                : "פעיל";
              return (
                <div key={a.id} className="flex justify-between items-center p-3 rounded-lg bg-slate-50 text-sm">
                  <div>
                    <p className="font-medium">{formatDate(a.checkIn)}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(a.checkIn)} → {a.checkOut ? formatDateTime(a.checkOut) : "..."}
                    </p>
                  </div>
                  <span className="font-bold text-opal-gold-dark">{hours} שע׳</span>
                </div>
              );
            })}
            {myAttendance.length === 0 && (
              <p className="text-center text-slate-400 py-6">אין דיווחי נוכחות החודש</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>דיווחי עבודה — שלבים שסימנתי</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {workReports.map((r, i) => (
              <div key={`${r.orderId}-${r.stage}-${i}`} className="p-3 rounded-lg border text-sm">
                <div className="flex justify-between">
                  <span className="font-bold">{r.serialNumber}</span>
                  <span className="text-xs text-slate-400">{formatDate(r.completedAt)}</span>
                </div>
                <p className="text-slate-600">{r.patientName}</p>
                <p className="text-emerald-600 text-xs mt-1">✓ {r.stageLabel}</p>
              </div>
            ))}
            {workReports.length === 0 && (
              <p className="text-center text-slate-400 py-6">טרם דווחו שלבים — עבור ל&quot;מעקב ייצור&quot;</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
