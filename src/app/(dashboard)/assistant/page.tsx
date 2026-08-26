"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/providers/AppProvider";
import { apiGet, apiPost } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { LAB_INFO } from "@/lib/constants/labels";
import { isAssistantOnlyUser } from "@/lib/user-roles";
import { captureDeviceInfo } from "@/lib/attendance/verification/device";
import { formatAttendanceTime } from "@/lib/attendance/gate/time-format";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusPayload = {
  hasOpenRecord: boolean;
  record: { checkIn: string | Date; checkOut?: string | Date | null } | null;
};

type LastShift = {
  checkIn: Date;
  checkOut: Date;
};

function formatClock(d: Date): string {
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateHe(d: Date): string {
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AssistantAttendancePage() {
  const { currentUser, logout, isLoading } = useApp();
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasOpen, setHasOpen] = useState(false);
  const [openCheckIn, setOpenCheckIn] = useState<Date | null>(null);
  const [lastShift, setLastShift] = useState<LastShift | null>(null);

  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!isAssistantOnlyUser(currentUser)) {
      router.replace("/");
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    setLoadingStatus(true);
    setError("");
    try {
      const data = await apiGet<StatusPayload>("/api/attendance/status");
      setHasOpen(Boolean(data.hasOpenRecord));
      setOpenCheckIn(data.record?.checkIn ? new Date(data.record.checkIn) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת סטטוס נכשלה");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const punch = async (action: "check-in" | "check-out") => {
    setBusy(true);
    setError("");
    try {
      const device = captureDeviceInfo();
      const res = await apiPost<{
        action: string;
        hasOpenRecord: boolean;
        record: { checkIn: string | Date; checkOut?: string | Date | null } | null;
        message?: string;
      }>("/api/attendance/assistant/punch", { action, device });

      if (action === "check-out" && openCheckIn) {
        setLastShift({
          checkIn: openCheckIn,
          checkOut: new Date(),
        });
      }
      if (action === "check-in") {
        setLastShift(null);
      }

      setHasOpen(Boolean(res.hasOpenRecord));
      setOpenCheckIn(res.record?.checkIn ? new Date(res.record.checkIn) : null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!currentUser || !isAssistantOnlyUser(currentUser)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">טוען...</div>
    );
  }

  const firstName = currentUser.name.split(/\s+/)[0] || currentUser.name;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 py-6">
      <header className="mb-8 text-center">
        <p className="text-xs font-medium tracking-wide text-opal-gold-dark">{LAB_INFO.name}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">שלום {firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">{formatDateHe(now)}</p>
        <p className="mt-3 font-mono text-3xl font-semibold tabular-nums text-slate-800">
          {formatClock(now)}
        </p>
      </header>

      <section className="flex flex-1 flex-col justify-center gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">נוכחות היום</h2>

          {loadingStatus ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              טוען סטטוס...
            </p>
          ) : hasOpen && openCheckIn ? (
            <div className="space-y-1">
              <p className="text-sm text-slate-500">כניסה לעבודה</p>
              <p className="text-2xl font-bold text-emerald-700">
                {formatAttendanceTime(openCheckIn)}
              </p>
            </div>
          ) : lastShift ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                כניסה:{" "}
                <span className="font-semibold text-slate-900">
                  {formatAttendanceTime(lastShift.checkIn)}
                </span>
              </p>
              <p className="text-sm text-slate-600">
                יציאה:{" "}
                <span className="font-semibold text-slate-900">
                  {formatAttendanceTime(lastShift.checkOut)}
                </span>
              </p>
              <p className="pt-2 text-sm font-medium text-slate-500">המשמרת הסתיימה</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">טרם נרשמה כניסה היום</p>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">{error}</p>
        )}

        {!hasOpen ? (
          <Button
            type="button"
            size="lg"
            disabled={busy || loadingStatus}
            onClick={() => void punch("check-in")}
            className={cn(
              "h-16 w-full rounded-2xl text-lg font-bold shadow-md",
              "bg-emerald-600 text-white hover:bg-emerald-700",
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            כניסה
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={busy || loadingStatus}
            onClick={() => void punch("check-out")}
            className={cn(
              "h-16 w-full rounded-2xl text-lg font-bold shadow-md",
              "bg-slate-800 text-white hover:bg-slate-900",
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
            יציאה
          </Button>
        )}
      </section>

      <footer className="mt-8 text-center">
        <button
          type="button"
          onClick={() => void logout()}
          className="text-sm text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
        >
          התנתקות
        </button>
      </footer>
    </div>
  );
}
