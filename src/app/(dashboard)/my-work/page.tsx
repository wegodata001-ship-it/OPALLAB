"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select, Input } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { AttendanceLocationDisplay } from "@/components/attendance/location-display";
import { USER_ROLE_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants/labels";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { calculateEmployeePay, getSalaryLabel } from "@/lib/salary";
import { isSystemAdmin } from "@/lib/permissions";
import { AttendanceCameraModal } from "@/components/attendance/AttendanceCameraModal";
import { AttendanceVerificationCard } from "@/components/attendance/AttendanceVerificationCard";
import { Clock, CheckCircle2, Wallet, MapPin, Loader2 } from "lucide-react";
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
  const [attendanceCode, setAttendanceCode] = useState("");
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<"check-in" | "check-out">("check-in");

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

  const myStageOrders = useMemo(
    () => orders.filter((o) => myStages.includes(o.status)),
    [orders, myStages],
  );

  if (!currentUser) return null;

  const monthReports = workReports.filter((r) => r.completedAt >= monthStart);
  const estimatedPay = calculateEmployeePay(currentUser, totalHours);
  const adminBypass = isSystemAdmin(currentUser.role);

  const handleAttendance = async () => {
    if (!currentUser || attendanceBusy) return;
    setAttendanceBusy(true);
    setMessage("");
    try {
      const targetMode = isActive ? "check-out" : "check-in";
      setCameraMode(targetMode);
      setCameraModalOpen(true);
      setMessage(targetMode === "check-in" ? "ממתין לצילום" : "ממתין לצילום");
    } finally {
      setAttendanceBusy(false);
    }
  };

  const handleVerifiedPhoto = async (photo: { photoUrl: string | null; photoPath: string; fileName: string }) => {
    if (!currentUser) return;

    const gps = await import("@/lib/client-gps").then((m) => m.captureGps());
    const meta = {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy: gps.accuracy,
      deviceInfo: gps.deviceInfo,
      wifiSsid: selectedWifi || undefined,
      photoUrl: photo.photoUrl,
      photoPath: photo.photoPath,
      fileName: photo.fileName,
      address: undefined,
    };

    if (isActive) {
      await checkOut(currentUser.id, "WIFI", meta);
      setMessage(`יציאה נרשמה — ${formatDateTime(new Date())}`);
    } else {
      if (labSettings.wifiAttendanceEnabled && !adminBypass) {
        if (!selectedWifi || !labSettings.allowedWifiSsids.includes(selectedWifi)) {
          setMessage("יש לבחור רשת WiFi מורשית של המעבדה");
          return;
        }
        if (labSettings.attendanceCode && attendanceCode !== labSettings.attendanceCode) {
          setMessage("קוד נוכחות שגוי");
          return;
        }
      }
      await checkIn(currentUser.id, "WIFI", meta);
      setMessage(`כניסה נרשמה — ${formatDateTime(new Date())}`);
    }
    setCameraModalOpen(false);
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

      <AttendanceCameraModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        mode={cameraMode}
        userId={currentUser.id}
        onVerified={handleVerifiedPhoto}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-opal-gold" />
              רישום נוכחות (GPS)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={cn(
              "rounded-xl p-4 text-center",
              isActive ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50 border"
            )}>
              <p className="text-sm text-slate-600 mb-1">סטטוס נוכחי</p>
              <p className={cn("text-lg font-bold", isActive ? "text-emerald-700" : "text-slate-500")}>
                {isActive ? "בעבודה" : "לא נרשמה כניסה"}
              </p>
            </div>

            <p className="text-xs text-slate-500 text-center">
              בעת כניסה/יציאה המערכת תבקש הרשאת GPS לתיעוד המיקום. אין חסימה אם המיקום רחוק מהמשרד.
            </p>

            {labSettings.wifiAttendanceEnabled && !adminBypass && (
              <>
                <div>
                  <Label>רשת WiFi מורשית (אופציונלי)</Label>
                  <Select value={selectedWifi} onChange={(e) => setSelectedWifi(e.target.value)}>
                    <option value="">בחר רשת...</option>
                    {labSettings.allowedWifiSsids.map((ssid) => (
                      <option key={ssid} value={ssid}>{ssid}</option>
                    ))}
                  </Select>
                </div>
                {labSettings.attendanceCode && (
                  <div>
                    <Label>קוד נוכחות</Label>
                    <Input value={attendanceCode} onChange={(e) => setAttendanceCode(e.target.value)} placeholder="קוד מהמזכירות" />
                  </div>
                )}
              </>
            )}

            <Button size="lg" className="w-full" onClick={handleAttendance} disabled={attendanceBusy}>
              {attendanceBusy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isActive ? "רושם יציאה..." : "רושם כניסה..."}
                </span>
              ) : (
                isActive ? "רישום יציאה" : "רישום כניסה"
              )}
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

        {myStageOrders.length > 0 && (
          <Card>
            <CardHeader><CardTitle>הזמנות בשלבים שלי ({myStageOrders.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {myStageOrders.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="block p-3 rounded-lg border text-sm hover:border-opal-gold/50">
                  <div className="flex justify-between">
                    <span className="font-bold">{o.serialNumber}</span>
                    <span className="text-xs text-opal-gold-dark">{ORDER_STATUS_LABELS[o.status]}</span>
                  </div>
                  <p className="text-slate-600">{o.patient.name}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>יומן נוכחות — החודש</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-72 overflow-y-auto">
            {myAttendance.map((a) => {
              const hours = a.checkOut
                ? ((a.checkOut.getTime() - a.checkIn.getTime()) / 3600000).toFixed(1)
                : "פעיל";
              const inLat = a.checkInLatitude ?? a.latitude;
              const inLng = a.checkInLongitude ?? a.longitude;
              return (
                <div key={a.id} className="p-3 rounded-lg bg-slate-50 text-sm space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="font-medium">{formatDate(a.checkIn)}</p>
                    <span className="font-bold text-opal-gold-dark">{hours} שע׳</span>
                  </div>
                  <AttendanceLocationDisplay
                    label="כניסה"
                    time={a.checkIn}
                    address={a.checkInAddress}
                    lat={inLat}
                    lng={inLng}
                  />
                  <AttendanceVerificationCard record={a} canView={true} />
                  {a.checkOut && (
                    <AttendanceLocationDisplay
                      label="יציאה"
                      time={a.checkOut}
                      address={a.checkOutAddress}
                      lat={a.checkOutLatitude}
                      lng={a.checkOutLongitude}
                    />
                  )}
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
