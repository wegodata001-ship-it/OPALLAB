"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/providers/AppProvider";
import { LAB_INFO, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { formatDateTime } from "@/lib/utils";
import { captureGpsOptional } from "@/lib/client-gps";
import { Nfc, MapPin, ArrowRight, Loader2 } from "lucide-react";
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

  const handleToggle = useCallback(async () => {
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
        await checkIn(currentUser.id, "NFC", gps);
        setMessage(`כניסה נרשמה — ${formatDateTime(new Date())}`);
      }
    } finally {
      setBusy(false);
    }
  }, [currentUser, activeRecords, checkIn, checkOut, busy]);

  useEffect(() => {
    if (nfcTag && currentUser && !busy) void handleToggle();
  }, [nfcTag, currentUser, busy, handleToggle]);

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-opal-gold flex items-center justify-center mb-4">
              <Nfc className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">{LAB_INFO.name}</h1>
            <p className="text-slate-400 text-sm mt-1">שעון נוכחות NFC · GPS</p>
          </div>
          <form onSubmit={handleLogin} className="bg-white rounded-2xl p-6 space-y-4">
            <input className="w-full rounded-lg border px-3 py-2.5 text-sm" placeholder="שם משתמש" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input className="w-full rounded-lg border px-3 py-2.5 text-sm" type="password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} />
            {message && <p className="text-red-600 text-sm">{message}</p>}
            <Button type="submit" className="w-full" size="lg">כניסה לנוכחות</Button>
          </form>
          <Link href="/" className="flex items-center justify-center gap-1 text-slate-500 text-sm mt-6 hover:text-white">
            <ArrowRight className="h-4 w-4" />חזרה למערכת
          </Link>
        </div>
      </div>
    );
  }

  const isActive = activeRecords.some((a) => a.userId === currentUser.id);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <p className="text-opal-gold text-sm font-medium mb-2">{LAB_INFO.name} · נוכחות</p>
      <p className="text-white text-xl font-bold mb-1">{currentUser.name}</p>
      <p className="text-slate-400 text-sm mb-8">{USER_ROLE_LABELS[currentUser.role]}</p>

      <button
        onClick={() => void handleToggle()}
        disabled={busy}
        className={`relative h-48 w-48 rounded-full border-4 flex flex-col items-center justify-center transition-all mb-6 disabled:opacity-70 ${
          pulse ? "border-opal-gold bg-opal-gold/20 scale-105" : isActive ? "border-emerald-400 bg-emerald-400/10" : "border-slate-600 bg-slate-800 hover:border-opal-gold/50"
        }`}
      >
        {busy ? (
          <Loader2 className="h-16 w-16 text-opal-gold animate-spin" />
        ) : (
          <Nfc className={`h-16 w-16 ${isActive ? "text-emerald-400" : "text-opal-gold"}`} />
        )}
        <span className="text-white text-sm mt-3 font-medium">{isActive ? "לחץ ליציאה" : "הצמד טלפון ל-NFC"}</span>
      </button>

      {message && <p className="text-emerald-400 text-sm mb-4">{message}</p>}

      <div className="flex items-center gap-2 text-sm text-slate-400 mb-8">
        <MapPin className="h-4 w-4" />
        <span>מיקום GPS נרשם לתיעוד בלבד — ללא חסימה מרחוק</span>
      </div>

      <p className="text-xs text-slate-500">נוכחים: {activeRecords.length} · NFC: {currentUser.nfcTagId}</p>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <AttendanceKiosk />
    </Suspense>
  );
}
