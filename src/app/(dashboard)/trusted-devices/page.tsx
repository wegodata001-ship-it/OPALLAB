"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import { LAB_INFO } from "@/lib/constants/labels";
import { Smartphone, Shield, Trash2, Ban, CheckCircle2, History, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttendanceQrModal } from "@/components/attendance/gate/AttendanceQrModal";
import { OFFICIAL_ATTENDANCE_CHECKIN_URL } from "@/lib/attendance/gate/checkin-url";
import Link from "next/link";

type DeviceRow = {
  id: string;
  userId: string;
  userName: string;
  username: string;
  deviceKeyPreview: string;
  label: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  status: "ACTIVE" | "BLOCKED" | "REVOKED";
  registeredAt: string;
  lastUsedAt: string | null;
  lastIp: string | null;
  lastPunchAt: string | null;
};

type GateSettings = {
  labLatitude: number | null;
  labLongitude: number | null;
  geofenceRadiusMeters: number;
  gateToken: string | null;
  geofenceEnabled: boolean;
};

type HistoryRow = {
  id: string;
  checkIn: string;
  checkOut: string | null;
  ipAddress: string | null;
  checkInAddress: string | null;
  checkInDeviceOs: string | null;
  checkInDeviceBrowser: string | null;
};

const STATUS_LABEL: Record<DeviceRow["status"], string> = {
  ACTIVE: "פעיל",
  BLOCKED: "חסום",
  REVOKED: "בוטל",
};

export default function TrustedDevicesPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [settings, setSettings] = useState<GateSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("120");
  const [token, setToken] = useState("");
  const [qrOpen, setQrOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/trusted-devices", { credentials: "include" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { devices: DeviceRow[]; settings: GateSettings };
        error?: { message?: string };
      };
      if (!json.success || !json.data) {
        throw new Error(json.error?.message || "טעינה נכשלה");
      }
      setDevices(json.data.devices);
      setSettings(json.data.settings);
      setLat(json.data.settings.labLatitude?.toString() ?? "");
      setLng(json.data.settings.labLongitude?.toString() ?? "");
      setRadius(String(json.data.settings.geofenceRadiusMeters ?? 120));
      setToken(json.data.settings.gateToken ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (deviceId: string, status: DeviceRow["status"]) => {
    await fetch("/api/attendance/trusted-devices", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, status }),
    });
    await load();
  };

  const remove = async (deviceId: string) => {
    if (!confirm("למחוק את המכשיר המאושר? העובד יידרש להירשם מחדש.")) return;
    await fetch(`/api/attendance/trusted-devices?deviceId=${encodeURIComponent(deviceId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const saveSettings = async () => {
    const res = await fetch("/api/attendance/trusted-devices", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-settings",
        labLatitude: lat ? Number(lat) : undefined,
        labLongitude: lng ? Number(lng) : undefined,
        geofenceRadiusMeters: radius ? Number(radius) : undefined,
        gateToken: token || null,
      }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error?.message || "שמירת הגדרות נכשלה");
      return;
    }
    await load();
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
      },
      () => setError("לא ניתן לקרוא מיקום מהמכשיר"),
      { enableHighAccuracy: true },
    );
  };

  const loadHistory = async (deviceId: string) => {
    setHistoryFor(deviceId);
    const res = await fetch(
      `/api/attendance/trusted-devices?view=history&deviceId=${encodeURIComponent(deviceId)}`,
      { credentials: "include" },
    );
    const json = await res.json();
    setHistory(json.data?.history ?? []);
  };

  const gateUrl = OFFICIAL_ATTENDANCE_CHECKIN_URL;

  return (
    <>
      <Header
        title="מכשירים מאושרים"
        description="Trusted Devices · שער QR/NFC לכניסת עובדים"
        actions={
          <div className="flex gap-2">
            <Link href="/system/attendance-qr">
              <Button type="button" className="gap-2">
                <QrCode className="h-4 w-4" />
                QR לנוכחות
              </Button>
            </Link>
            <Button type="button" variant="outline" onClick={() => setQrOpen(true)} className="gap-2">
              תצוגה מהירה
            </Button>
          </div>
        }
      />

      <AttendanceQrModal open={qrOpen} onClose={() => setQrOpen(false)} />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <Card className="mb-6 border-opal-gold/30 bg-amber-50/40">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">קישור נוכחות קבוע</p>
            <p className="text-sm text-slate-600 break-all mt-0.5" dir="ltr">
              {gateUrl}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              אותו קישור ל־QR מודפס ולתג NFC — אין צורך ליצור QR חדש בכל פעם.
            </p>
          </div>
          <Button type="button" size="lg" onClick={() => setQrOpen(true)} className="shrink-0 gap-2">
            <QrCode className="h-5 w-5" />
            QR לנוכחות
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5 text-opal-gold" />
            הגדרות שער המעבדה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>קו רוחב (Latitude)</Label>
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="32.08..." />
            </div>
            <div>
              <Label>קו אורך (Longitude)</Label>
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="34.78..." />
            </div>
            <div>
              <Label>רדיוס מותר (מטרים)</Label>
              <Input value={radius} onChange={(e) => setRadius(e.target.value)} type="number" />
            </div>
          </div>
          <div>
            <Label>קוד שער ל־QR (אופציונלי)</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="למשל OPAL-GATE-2026"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveSettings()}>
              שמור הגדרות
            </Button>
            <Button type="button" variant="outline" onClick={useMyLocation}>
              קבע מיקום לפי הטלפון הנוכחי
            </Button>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">
            <p className="font-medium text-slate-800">קישור רשמי ל־QR / NFC</p>
            <p className="text-slate-600 break-all mt-1" dir="ltr">
              {gateUrl}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              לחצו «QR לנוכחות» להדפסה / הורדה.
              {settings?.geofenceEnabled
                ? ` · גיאופנס פעיל (${settings.geofenceRadiusMeters}מ׳)`
                : " · גיאופנס כבוי עד שמירת קואורדינטות"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            מכשירים ({devices.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-slate-500">טוען...</p>}
          {!loading && devices.length === 0 && (
            <p className="text-sm text-slate-500">אין מכשירים מאושרים עדיין.</p>
          )}
          <div className="space-y-3">
            {devices.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{d.userName}</p>
                  <p className="text-xs text-slate-500">
                    {d.label || `${d.deviceType} · ${d.os} · ${d.browser}`} · {d.deviceKeyPreview}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    נרשם: {formatDateTime(new Date(d.registeredAt))}
                    {d.lastUsedAt ? ` · שימוש אחרון: ${formatDateTime(new Date(d.lastUsedAt))}` : ""}
                    {d.lastPunchAt
                      ? ` · כניסה אחרונה: ${formatDateTime(new Date(d.lastPunchAt))}`
                      : ""}
                  </p>
                  <span
                    className={cn(
                      "inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full",
                      d.status === "ACTIVE" && "bg-emerald-100 text-emerald-800",
                      d.status === "BLOCKED" && "bg-red-100 text-red-700",
                      d.status === "REVOKED" && "bg-slate-200 text-slate-700",
                    )}
                  >
                    {STATUS_LABEL[d.status]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {d.status !== "ACTIVE" && (
                    <Button size="sm" variant="outline" onClick={() => void setStatus(d.id, "ACTIVE")}>
                      <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
                      אשר
                    </Button>
                  )}
                  {d.status !== "BLOCKED" && (
                    <Button size="sm" variant="outline" onClick={() => void setStatus(d.id, "BLOCKED")}>
                      <Ban className="h-3.5 w-3.5 ml-1" />
                      חסום
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void loadHistory(d.id)}>
                    <History className="h-3.5 w-3.5 ml-1" />
                    היסטוריה
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200"
                    onClick={() => void remove(d.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 ml-1" />
                    מחק
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {historyFor && (
            <div className="mt-6 border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">היסטוריית כניסות למכשיר</p>
                <Button size="sm" variant="ghost" onClick={() => setHistoryFor(null)}>
                  סגור
                </Button>
              </div>
              <div className="space-y-2 max-h-72 overflow-auto">
                {history.map((h) => (
                  <div key={h.id} className="text-xs rounded-lg bg-slate-50 border px-3 py-2">
                    <p>
                      כניסה: {formatDateTime(new Date(h.checkIn))}
                      {h.checkOut ? ` · יציאה: ${formatDateTime(new Date(h.checkOut))}` : " · פתוח"}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {h.checkInDeviceOs} · {h.checkInDeviceBrowser}
                      {h.ipAddress ? ` · IP ${h.ipAddress}` : ""}
                      {h.checkInAddress ? ` · ${h.checkInAddress}` : ""}
                    </p>
                  </div>
                ))}
                {history.length === 0 && <p className="text-sm text-slate-400">אין רשומות</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400 mt-4">
        {LAB_INFO.name} — זיהוי המכשיר מבוסס Trusted Device (מזהה מוצפן בדפדפן), לא IMEI חומרה.
      </p>
    </>
  );
}
