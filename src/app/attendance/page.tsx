"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/providers/AppProvider";
import { LAB_INFO, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { formatDateTime } from "@/lib/utils";
import { captureGpsOptional } from "@/lib/client-gps";
import { apiPost } from "@/lib/api/client";
import { Nfc, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function AttendanceKiosk() {
  const searchParams = useSearchParams();
  const nfcTag = searchParams.get("nfc");
  const { currentUser, login, checkIn, checkOut, getActiveAttendance } = useApp();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pulse, setPulse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const activeRecords = getActiveAttendance();

  const handleToggleSelf = useCallback(async () => {
    if (!currentUser || busy) return;
    setBusy(true);
    setPulse(true);
    setTimeout(() => setPulse(false), 1200);
    try {
      const gps = await captureGpsOptional();
      const active = activeRecords.find((a) => a.userId === currentUser.id);
      if (active) {
        await checkOut(currentUser.id, "NFC", gps);
        setMessage(`יציאה נרשמה — ${formatDateTime(new Date())}`);
      } else {
        await checkIn(currentUser.id, "NFC", {
          ...gps,
          device: gps ? undefined : undefined,
        });
        setMessage(`כניסה נרשמה — ${formatDateTime(new Date())}`);
      }
    } finally {
      setBusy(false);
    }
  }, [currentUser, activeRecords, checkIn, checkOut, busy]);

  /** Tap NFC card: identify employee by tag and auto check-in/out */
  const handleNfcTag = useCallback(
    async (tag: string) => {
      if (busy) return;
      setBusy(true);
      setPulse(true);
      setTimeout(() => setPulse(false), 1200);
      try {
        const gps = await captureGpsOptional();
        const result = await apiPost<{ action: "check-in" | "check-out"; userName: string }>(
          "/api/operations",
          { action: "nfc-toggle", nfcTagId: tag, meta: gps },
        );
        setMessage(
          result.action === "check-in"
            ? `כניסה: ${result.userName} — ${formatDateTime(new Date())}`
            : `יציאה: ${result.userName} — ${formatDateTime(new Date())}`,
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "שגיאה בזיהוי כרטיס NFC");
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  useEffect(() => {
    if (!nfcTag || busy) return;
    if (currentUser) {
      // Logged-in: if tag matches user or any assigned tag — toggle by tag lookup
      void handleNfcTag(nfcTag);
    }
  }, [nfcTag]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await login(username, password);
      if (!user) setMessage("שם משתמש או סיסמה שגויים");
    } catch {
      setMessage("שם משתמש או סיסמה שגויים");
    }
  };

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-opal-gold">
              <Nfc className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">{LAB_INFO.name}</h1>
            <p className="mt-1 text-sm text-slate-400">שעון נוכחות NFC</p>
            {nfcTag ? (
              <p className="mt-2 text-xs text-opal-gold">זוהה כרטיס — התחבר להשלמת רישום</p>
            ) : null}
          </div>
          <form onSubmit={handleLogin} className="space-y-4 rounded-2xl bg-white p-6">
            <input
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
              placeholder="שם משתמש"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
              type="password"
              placeholder="סיסמה"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {message ? <p className="text-sm text-red-600">{message}</p> : null}
            <Button type="submit" className="w-full" size="lg">
              כניסה לנוכחות
            </Button>
          </form>
          <Link href="/" className="mt-6 flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-white">
            <ArrowRight className="h-4 w-4" />
            חזרה למערכת
          </Link>
        </div>
      </div>
    );
  }

  const isActive = activeRecords.some((a) => a.userId === currentUser.id);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6">
      <p className="mb-2 text-sm font-medium text-opal-gold">{LAB_INFO.name} · נוכחות NFC</p>
      <p className="mb-1 text-xl font-bold text-white">{currentUser.name}</p>
      <p className="mb-2 text-sm text-slate-400">{USER_ROLE_LABELS[currentUser.role]}</p>
      {currentUser.nfcTagId ? (
        <p className="mb-6 text-xs text-slate-500">כרטיס: {currentUser.nfcTagId}</p>
      ) : (
        <p className="mb-6 text-xs text-amber-400">לא הוגדר כרטיס NFC — פנה למנהל</p>
      )}

      <button
        type="button"
        onClick={() => void handleToggleSelf()}
        disabled={busy}
        className={`relative mb-6 flex h-48 w-48 flex-col items-center justify-center rounded-full border-4 transition-all disabled:opacity-70 ${
          pulse
            ? "scale-105 border-opal-gold bg-opal-gold/20"
            : isActive
              ? "border-emerald-400 bg-emerald-400/10"
              : "border-slate-600 bg-slate-800 hover:border-opal-gold/50"
        }`}
      >
        {busy ? (
          <Loader2 className="h-10 w-10 animate-spin text-opal-gold" />
        ) : (
          <>
            <Nfc className={`mb-2 h-12 w-12 ${isActive ? "text-emerald-400" : "text-white"}`} />
            <span className="text-lg font-bold text-white">{isActive ? "יציאה" : "כניסה"}</span>
          </>
        )}
      </button>

      <p className="mb-4 max-w-xs text-center text-sm text-slate-400">
        הצמד את הטלפון לכרטיס NFC בכניסה למעבדה, או לחץ לרישום ידני
      </p>
      {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
      <Link href="/dashboard" className="mt-8 text-sm text-slate-500 hover:text-white">
        חזרה למערכת
      </Link>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">טוען...</div>}>
      <AttendanceKiosk />
    </Suspense>
  );
}
