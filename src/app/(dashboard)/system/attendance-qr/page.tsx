"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AttendanceQrPanel } from "@/components/attendance/gate/AttendanceQrPanel";
import { useApp } from "@/providers/AppProvider";
import { canAccessUser } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { OFFICIAL_ATTENDANCE_CHECKIN_URL } from "@/lib/attendance/gate/checkin-url";
import {
  Ban,
  CheckCircle2,
  History,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  ACTIVE: "מאושר",
  BLOCKED: "חסום",
  REVOKED: "בוטל — נדרשת הרשמה מחדש",
};

export default function SystemAttendanceQrPage() {
  const { currentUser } = useApp();
  const allowed = currentUser ? canAccessUser(currentUser, "trusted-devices") : false;

  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/trusted-devices", { credentials: "include" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { devices: DeviceRow[] };
        error?: { message?: string };
      };
      if (res.status === 403) {
        setError("אין הרשאה לצפות בנתונים אלה");
        return;
      }
      if (!json.success || !json.data) {
        throw new Error(json.error?.message || "טעינה נכשלה");
      }
      setDevices(json.data.devices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

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

  const resetDevice = async (deviceId: string) => {
    if (!confirm("לאפס את המכשיר? הסטטוס יהפוך ל«בוטל» והעובד יירשם מחדש בסריקה הבאה.")) return;
    await setStatus(deviceId, "REVOKED");
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

  if (!currentUser) return null;

  if (!allowed) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <ShieldAlert className="h-14 w-14 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold text-slate-900">אין לך הרשאה לצפות בדף זה</h1>
        <p className="text-sm text-slate-500">
          מסך QR לנוכחות זמין למנהלי מערכת בלבד (Admin / Owner / Secretary).
        </p>
        <p className="text-xs text-slate-400">HTTP 403 · Forbidden</p>
        <Link href="/dashboard">
          <Button variant="outline">חזרה ללוח הבקרה</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <Header
        title="QR לנוכחות"
        description="קישור קבוע · הדפסה · ניהול מכשירים מאושרים"
      />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR רשמי לכניסת המעבדה</CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceQrPanel />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">מידע מהיר</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>
              הקישור הקבוע לכל מערכת הנוכחות:
            </p>
            <p className="font-mono text-xs break-all bg-slate-50 border rounded-lg p-3" dir="ltr">
              {OFFICIAL_ATTENDANCE_CHECKIN_URL}
            </p>
            <ul className="list-disc pr-5 space-y-1">
              <li>הדפיסו את ה־QR והציבו בכניסה</li>
              <li>כתבו את אותו קישור לתג NFC</li>
              <li>עובד חדש נרשם פעם אחת (התחברות + GPS + סלפי)</li>
              <li>מהפעם הבאה — סריקה בלבד</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link href="/attendance/checkin" target="_blank">
                <Button variant="outline" size="sm">
                  פתיחת שער הנוכחות
                </Button>
              </Link>
              <Link href="/trusted-devices">
                <Button variant="outline" size="sm">
                  הגדרות גיאופנס
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5 ml-1" />
                רענון טבלה
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">עובדים ומכשירים מאושרים ({devices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          {loading && <p className="text-sm text-slate-500">טוען...</p>}

          {!loading && devices.length === 0 && (
            <p className="text-sm text-slate-500">
              אין מכשירים מאושרים עדיין. לאחר שעובד ישלים הרשמה בשער — הוא יופיע כאן.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right min-w-[720px]">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 px-2 font-medium">שם העובד</th>
                  <th className="py-2 px-2 font-medium">סטטוס הרשמה</th>
                  <th className="py-2 px-2 font-medium">מכשיר מאושר</th>
                  <th className="py-2 px-2 font-medium">מערכת הפעלה</th>
                  <th className="py-2 px-2 font-medium">כניסה אחרונה</th>
                  <th className="py-2 px-2 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 align-top">
                    <td className="py-3 px-2">
                      <p className="font-semibold text-slate-900">{d.userName}</p>
                      <p className="text-xs text-slate-400">{d.username}</p>
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className={cn(
                          "inline-block text-[11px] font-bold px-2 py-0.5 rounded-full",
                          d.status === "ACTIVE" && "bg-emerald-100 text-emerald-800",
                          d.status === "BLOCKED" && "bg-red-100 text-red-700",
                          d.status === "REVOKED" && "bg-slate-200 text-slate-700",
                        )}
                      >
                        {STATUS_LABEL[d.status]}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-1">
                        נרשם: {formatDateTime(new Date(d.registeredAt))}
                      </p>
                    </td>
                    <td className="py-3 px-2">
                      <p className="text-slate-800">{d.label || d.deviceType || "—"}</p>
                      <p className="text-xs text-slate-400">{d.deviceKeyPreview}</p>
                      <p className="text-xs text-slate-400">{d.browser || ""}</p>
                    </td>
                    <td className="py-3 px-2 text-slate-700">{d.os || "—"}</td>
                    <td className="py-3 px-2 text-slate-700">
                      {d.lastPunchAt || d.lastUsedAt
                        ? formatDateTime(new Date(d.lastPunchAt || d.lastUsedAt!))
                        : "—"}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex flex-wrap gap-1">
                        {d.status !== "ACTIVE" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] px-2"
                            onClick={() => void setStatus(d.id, "ACTIVE")}
                          >
                            <CheckCircle2 className="h-3 w-3 ml-0.5" />
                            אישור מחדש
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2"
                          onClick={() => void resetDevice(d.id)}
                        >
                          <RefreshCw className="h-3 w-3 ml-0.5" />
                          איפוס מכשיר
                        </Button>
                        {d.status !== "BLOCKED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] px-2"
                            onClick={() => void setStatus(d.id, "BLOCKED")}
                          >
                            <Ban className="h-3 w-3 ml-0.5" />
                            חסימה
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2"
                          onClick={() => void loadHistory(d.id)}
                        >
                          <History className="h-3 w-3 ml-0.5" />
                          לוגים
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] px-2 text-red-600 border-red-200"
                          onClick={() => void remove(d.id)}
                        >
                          <Trash2 className="h-3 w-3 ml-0.5" />
                          מחיקה
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {historyFor && (
            <div className="mt-6 border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">לוג כניסות למכשיר</p>
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
    </>
  );
}
