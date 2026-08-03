"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import {
  Eye,
  Loader2,
  RefreshCw,
  Smartphone,
  Trash2,
  Ban,
  CheckCircle2,
  Search,
} from "lucide-react";

export type ConnectedDeviceRow = {
  id: string;
  userId: string;
  userName: string;
  username: string;
  deviceKeyPreview: string;
  deviceKey: string;
  label: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  status: "ACTIVE" | "BLOCKED" | "REVOKED";
  registeredAt: string | Date;
  lastUsedAt: string | Date | null;
  lastIp: string | null;
  lastPunchAt: string | Date | null;
  userAgent: string | null;
};

function statusLabel(status: ConnectedDeviceRow["status"]) {
  if (status === "ACTIVE") return { text: "מאושר", className: "bg-emerald-50 text-emerald-700" };
  if (status === "BLOCKED") return { text: "חסום", className: "bg-red-50 text-red-700" };
  return { text: "בוטל", className: "bg-amber-50 text-amber-800" };
}

function deviceTitle(d: ConnectedDeviceRow) {
  return d.label || d.deviceType || "מכשיר";
}

export function ConnectedDevicesTab({
  onOpenEmployee,
}: {
  onOpenEmployee?: (userId: string) => void;
}) {
  const [devices, setDevices] = useState<ConnectedDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<ConnectedDeviceRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance/trusted-devices", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { devices?: ConnectedDeviceRow[] };
        error?: { message?: string };
      };
      if (!json.success) throw new Error(json.error?.message || "טעינת מכשירים נכשלה");
      setDevices(json.data?.devices ?? []);
    } catch (err) {
      setDevices([]);
      setError(err instanceof Error ? err.message : "טעינת מכשירים נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return devices;
    return devices.filter((d) =>
      [d.userName, d.username, d.label, d.os, d.browser, d.deviceType, d.deviceKeyPreview]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [devices, q]);

  const mutate = async (
    deviceId: string,
    action: "delete" | "reset" | "approve" | "block",
  ) => {
    setBusyId(deviceId);
    setError(null);
    try {
      if (action === "delete") {
        if (!confirm("למחוק את המכשיר? העובד יידרש להירשם מחדש בסריקת QR.")) return;
        const res = await fetch(
          `/api/attendance/trusted-devices?deviceId=${encodeURIComponent(deviceId)}`,
          { method: "DELETE", credentials: "include" },
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || "מחיקה נכשלה");
      } else {
        const status =
          action === "reset" ? "REVOKED" : action === "block" ? "BLOCKED" : "ACTIVE";
        const labels = {
          reset: "לאפס (לבטל אישור) את המכשיר?",
          block: "לחסום את המכשיר?",
          approve: "לאשר מחדש את המכשיר?",
        } as const;
        if (action !== "approve" && !confirm(labels[action])) return;
        const res = await fetch("/api/attendance/trusted-devices", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, status }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || "עדכון נכשל");
      }
      await load();
      if (detail?.id === deviceId) setDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-opal-gold" />
            מכשירים מחוברים
          </h2>
          <p className="text-sm text-slate-500">
            מכשירים מאושרים לרישום נוכחות ב־QR · {devices.length} מכשירים
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש עובד / מכשיר..."
              className="pr-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-opal-gold" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm text-slate-500">
          אין מכשירים מחוברים
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm text-right min-w-[900px]">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">עובד</th>
                <th className="px-3 py-3 font-medium">סוג מכשיר</th>
                <th className="px-3 py-3 font-medium">מערכת הפעלה</th>
                <th className="px-3 py-3 font-medium">דפדפן</th>
                <th className="px-3 py-3 font-medium">מזהה מכשיר</th>
                <th className="px-3 py-3 font-medium">תאריך הרשמה</th>
                <th className="px-3 py-3 font-medium">כניסה אחרונה</th>
                <th className="px-3 py-3 font-medium">סטטוס</th>
                <th className="px-3 py-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const st = statusLabel(d.status);
                const busy = busyId === d.id;
                return (
                  <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="font-semibold text-slate-900 hover:text-opal-gold text-right"
                        onClick={() => onOpenEmployee?.(d.userId)}
                      >
                        {d.userName}
                      </button>
                      <p className="text-[11px] text-slate-400">{d.username}</p>
                    </td>
                    <td className="px-3 py-3">{deviceTitle(d)}</td>
                    <td className="px-3 py-3">{d.os || "—"}</td>
                    <td className="px-3 py-3">{d.browser || "—"}</td>
                    <td className="px-3 py-3 font-mono text-xs" dir="ltr">
                      {d.deviceKeyPreview}
                    </td>
                    <td className="px-3 py-3 text-xs">{formatDate(d.registeredAt)}</td>
                    <td className="px-3 py-3 text-xs">
                      {d.lastUsedAt || d.lastPunchAt
                        ? formatDateTime(d.lastUsedAt ?? d.lastPunchAt!)
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          st.className,
                        )}
                      >
                        {st.text}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          title="צפייה בפרטים"
                          onClick={() => setDetail(d)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || d.status === "ACTIVE"}
                          title="אישור מחדש"
                          onClick={() => void mutate(d.id, "approve")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          title="איפוס מכשיר"
                          onClick={() => void mutate(d.id, "reset")}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || d.status === "BLOCKED"}
                          title="חסימה"
                          onClick={() => void mutate(d.id, "block")}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          disabled={busy}
                          title="מחיקה"
                          onClick={() => void mutate(d.id, "delete")}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">פרטי מכשיר</h3>
            <dl className="space-y-2 text-sm">
              <Row label="עובד" value={detail.userName} />
              <Row label="סוג" value={deviceTitle(detail)} />
              <Row label="מערכת הפעלה" value={detail.os || "—"} />
              <Row label="דפדפן" value={detail.browser || "—"} />
              <Row label="מזהה" value={detail.deviceKeyPreview} ltr />
              <Row label="IP אחרון" value={detail.lastIp || "—"} ltr />
              <Row label="נרשם" value={formatDateTime(detail.registeredAt)} />
              <Row
                label="שימוש אחרון"
                value={
                  detail.lastUsedAt ? formatDateTime(detail.lastUsedAt) : "—"
                }
              />
              <Row label="סטטוס" value={statusLabel(detail.status).text} />
              <div>
                <dt className="text-xs text-slate-500 mb-1">User Agent</dt>
                <dd className="text-xs break-all text-slate-700 bg-slate-50 rounded-lg p-2" dir="ltr">
                  {detail.userAgent || "—"}
                </dd>
              </div>
            </dl>
            <Button className="w-full" variant="outline" onClick={() => setDetail(null)}>
              סגור
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  ltr,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn("font-medium text-slate-900", ltr && "font-mono text-xs")} dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}
