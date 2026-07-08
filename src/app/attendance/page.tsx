"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/providers/AppProvider";
import { LAB_INFO, USER_ROLE_LABELS } from "@/lib/constants/labels";
import { LAB_GEOFENCE, isInsidePolygon } from "@/lib/geofence";
import { formatDateTime } from "@/lib/utils";
import { Nfc, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function AttendanceKiosk() {
  const searchParams = useSearchParams();
  const nfcTag = searchParams.get("nfc");
  const { currentUser, login, checkIn, checkOut, getActiveAttendance } = useApp();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pulse, setPulse] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"inside" | "outside" | "unknown">("unknown");
  const [message, setMessage] = useState("");

  const activeRecords = getActiveAttendance();

  const handleToggle = useCallback(() => {
    if (!currentUser) return;
    setPulse(true);
    setTimeout(() => setPulse(false), 1200);
    const active = activeRecords.find((a) => a.userId === currentUser.id);
    if (active) {
      checkOut(currentUser.id, "NFC");
      setMessage(`יציאה נרשמה — ${formatDateTime(new Date())}`);
    } else {
      checkIn(currentUser.id, "NFC");
      setMessage(`כניסה נרשמה — ${formatDateTime(new Date())}`);
    }
  }, [currentUser, activeRecords, checkIn, checkOut]);

  useEffect(() => {
    if (nfcTag && currentUser) handleToggle();
  }, [nfcTag, currentUser, handleToggle]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const inside = isInsidePolygon(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          LAB_GEOFENCE
        );
        setGeoStatus(inside ? "inside" : "outside");
        if (!inside && currentUser) {
          const active = activeRecords.find((a) => a.userId === currentUser.id);
          if (active) {
            checkOut(currentUser.id, "GEOFENCE_AUTO");
            setMessage("יציאה אוטומטית — יצאת משטח המעבדה");
          }
        }
      },
      () => setGeoStatus("unknown"),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [currentUser, activeRecords, checkOut]);

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
            <p className="text-slate-400 text-sm mt-1">שעון נוכחות NFC · גיאופנס</p>
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
        onClick={handleToggle}
        className={`relative h-48 w-48 rounded-full border-4 flex flex-col items-center justify-center transition-all mb-6 ${
          pulse ? "border-opal-gold bg-opal-gold/20 scale-105" : isActive ? "border-emerald-400 bg-emerald-400/10" : "border-slate-600 bg-slate-800 hover:border-opal-gold/50"
        }`}
      >
        <Nfc className={`h-16 w-16 ${isActive ? "text-emerald-400" : "text-opal-gold"}`} />
        <span className="text-white text-sm mt-3 font-medium">{isActive ? "לחץ ליציאה" : "הצמד טלפון ל-NFC"}</span>
      </button>

      {message && <p className="text-emerald-400 text-sm mb-4">{message}</p>}

      <div className="flex items-center gap-2 text-sm text-slate-400 mb-8">
        <MapPin className="h-4 w-4" />
        {geoStatus === "inside" && <span className="text-emerald-400">בתוך שטח המעבדה</span>}
        {geoStatus === "outside" && <span className="text-amber-400">מחוץ לשטח</span>}
        {geoStatus === "unknown" && <span>ממתין ל-GPS...</span>}
      </div>

      <div className="w-full max-w-xs rounded-xl border border-slate-700 bg-slate-800/50 p-4 mb-6">
        <p className="text-xs text-slate-500 mb-2 text-center">פוליגון גיאופנס</p>
        <svg viewBox="0 0 200 120" className="w-full">
          <polygon points="30,20 170,20 170,100 30,100" fill="rgba(201,162,39,0.1)" stroke="#c9a227" strokeWidth="2" strokeDasharray="4" />
          <circle cx="100" cy="60" r="6" fill={geoStatus === "inside" ? "#34d399" : "#f59e0b"} />
        </svg>
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
