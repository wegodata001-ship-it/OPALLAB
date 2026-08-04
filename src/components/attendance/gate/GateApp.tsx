"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAB_INFO } from "@/lib/constants/labels";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { getOrCreateDeviceKey } from "@/lib/attendance/gate/device-key";
import {
  resetGatePunchLock,
  runGatePunchOnce,
  type GatePunchAction,
} from "@/lib/attendance/gate/punch-lock";
import {
  formatAttendanceDuration,
  formatAttendanceTime,
} from "@/lib/attendance/gate/time-format";
import { captureGpsForVerification } from "@/lib/attendance/verification/gps";
import { captureDeviceInfo } from "@/lib/attendance/verification/device";
import { AttendanceVerificationError } from "@/lib/attendance/verification/types";
import { permissionHelpText } from "@/lib/attendance/gate/open-settings";
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const GPS_REQUIRED_MSG = "יש לאשר הרשאת מיקום כדי לבצע רישום נוכחות.";

type Phase =
  | "booting"
  | "ready"
  | "punching"
  | "checkout_success"
  | "need_register"
  | "login"
  | "registering"
  | "permission_error"
  | "error";

type GpsSnapshot = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

type CheckoutSummary = {
  checkIn: string;
  checkOut: string;
  durationHours: number | null;
};

/**
 * Real time-clock gate:
 * - Not in shift → Entry only
 * - In shift → disabled "entered at" + Exit
 * - After exit → summary, then Entry again
 * Never auto-punches; one open shift max (enforced server-side).
 */
export function GateApp() {
  const { login, currentUser, isAuthenticated, logout } = useApp();

  const [phase, setPhase] = useState<Phase>("booting");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [hasOpenRecord, setHasOpenRecord] = useState(false);
  const [openCheckIn, setOpenCheckIn] = useState<string | null>(null);
  const [checkoutSummary, setCheckoutSummary] = useState<CheckoutSummary | null>(null);
  const bootOnceRef = useRef(false);

  const failPermission = useCallback((msg?: string) => {
    setMessage(msg || GPS_REQUIRED_MSG);
    setDetail(permissionHelpText());
    setPhase("permission_error");
  }, []);

  const goReady = useCallback(
    (opts: { userName?: string; hasOpen: boolean; checkIn?: string | null }) => {
      if (opts.userName) setUserName(opts.userName);
      setHasOpenRecord(opts.hasOpen);
      setOpenCheckIn(opts.hasOpen ? opts.checkIn ?? null : null);
      setCheckoutSummary(null);
      setMessage("");
      setPhase("ready");
    },
    [],
  );

  const refreshTrustedState = useCallback(async () => {
    const key = deviceKey || getOrCreateDeviceKey();
    try {
      const res = await fetch("/api/attendance/gate/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey: key }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          status: string;
          userName?: string;
          hasOpenRecord?: boolean;
          openCheckIn?: string | null;
        };
      };
      if (json.success && json.data?.status === "trusted") {
        goReady({
          userName: json.data.userName,
          hasOpen: Boolean(json.data.hasOpenRecord),
          checkIn: json.data.openCheckIn ?? null,
        });
        return;
      }
    } catch {
      /* ignore */
    }
    setPhase("error");
    setMessage("לא ניתן לרענן את מצב המשמרת");
  }, [deviceKey, goReady]);

  const submitPunch = useCallback(
    async (opts: { key: string; action: GatePunchAction; gps: GpsSnapshot }) => {
      setPhase("punching");
      setMessage(opts.action === "check-in" ? "רושם כניסה..." : "רושם יציאה...");
      resetGatePunchLock();

      try {
        const result = await runGatePunchOnce(async () => {
          const device = captureDeviceInfo();
          const res = await fetch("/api/attendance/gate/punch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              deviceKey: opts.key,
              latitude: opts.gps.latitude,
              longitude: opts.gps.longitude,
              accuracy: opts.gps.accuracy,
              intendedAction: opts.action,
              device,
            }),
          });
          const json = (await res.json()) as {
            success?: boolean;
            data?: {
              action: GatePunchAction;
              userName: string;
              message: string;
              durationHours?: number | null;
              checkIn?: string;
              checkOut?: string | null;
            };
            error?: { message?: string; details?: { code?: string } | null };
          };

          if (!json.success || !json.data?.action) {
            const code =
              json.error?.details && typeof json.error.details === "object"
                ? json.error.details.code
                : undefined;
            const err = new Error(json.error?.message || "רישום הנוכחות נכשל") as Error & {
              code?: string;
              status?: number;
            };
            err.code = code;
            err.status = res.status;
            throw err;
          }

          return {
            action: json.data.action,
            userName: json.data.userName,
            message: json.data.message,
            durationHours: json.data.durationHours ?? null,
            checkIn: json.data.checkIn ?? null,
            checkOut: json.data.checkOut ?? null,
          };
        });

        setUserName(result.userName);

        if (result.action === "check-in") {
          goReady({
            userName: result.userName,
            hasOpen: true,
            checkIn: result.checkIn ?? new Date().toISOString(),
          });
          return;
        }

        setCheckoutSummary({
          checkIn: result.checkIn ?? openCheckIn ?? "",
          checkOut: result.checkOut ?? new Date().toISOString(),
          durationHours: result.durationHours ?? null,
        });
        setHasOpenRecord(false);
        setOpenCheckIn(null);
        setPhase("checkout_success");
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code)
            : undefined;
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status?: number }).status)
            : undefined;

        if (code === "DEVICE_UNKNOWN" || code === "DEVICE_REVOKED" || status === 404) {
          resetGatePunchLock();
          setPhase("need_register");
          setMessage(err instanceof Error ? err.message : "נדרשת הרשמה חד-פעמית למכשיר זה");
          return;
        }
        if (code === "ALREADY_CHECKED_IN") {
          resetGatePunchLock();
          const msg =
            err instanceof Error
              ? err.message
              : `כבר נכנסת היום בשעה ${formatAttendanceTime(openCheckIn)}.\nיש לבצע יציאה לפני כניסה חדשה.`;
          void refreshTrustedState().then(() => setMessage(msg));
          return;
        }
        if (code === "NO_OPEN_CHECK_IN") {
          resetGatePunchLock();
          goReady({ hasOpen: false, checkIn: null });
          setMessage("לא נמצאה כניסה פתוחה.\nיש לבצע כניסה לפני יציאה.");
          return;
        }
        if (
          code === "GPS_REQUIRED" ||
          (err instanceof AttendanceVerificationError && err.step === "gps") ||
          (err instanceof Error && err.message.includes("מיקום"))
        ) {
          resetGatePunchLock();
          failPermission(GPS_REQUIRED_MSG);
          return;
        }
        resetGatePunchLock();
        setPhase("error");
        setMessage(err instanceof Error ? err.message : "שגיאה ברישום נוכחות");
      }
    },
    [failPermission, goReady, openCheckIn, refreshTrustedState],
  );

  const handlePunchClick = useCallback(
    async (action: GatePunchAction) => {
      if (action === "check-in" && hasOpenRecord) {
        setMessage(
          `כבר נכנסת היום בשעה ${formatAttendanceTime(openCheckIn)}.\nיש לבצע יציאה לפני כניסה חדשה.`,
        );
        return;
      }
      if (action === "check-out" && !hasOpenRecord) {
        setMessage("לא נמצאה כניסה פתוחה.\nיש לבצע כניסה לפני יציאה.");
        return;
      }

      const key = deviceKey || getOrCreateDeviceKey();
      setPhase("punching");
      setMessage("מאשרים מיקום GPS...");
      try {
        const gps = await captureGpsForVerification();
        await submitPunch({ key, action, gps });
      } catch (err) {
        if (err instanceof AttendanceVerificationError) {
          failPermission(GPS_REQUIRED_MSG);
          return;
        }
        failPermission(GPS_REQUIRED_MSG);
      }
    },
    [deviceKey, failPermission, hasOpenRecord, openCheckIn, submitPunch],
  );

  const bootstrap = useCallback(async () => {
    setPhase("booting");
    setMessage("טוען שעון נוכחות...");
    const key = getOrCreateDeviceKey();
    setDeviceKey(key);

    try {
      const res = await fetch("/api/attendance/gate/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey: key }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          status: string;
          userName?: string;
          hasOpenRecord?: boolean;
          openCheckIn?: string | null;
        };
        error?: { message?: string };
      };

      if (!json.success) {
        setPhase("error");
        setMessage(json.error?.message || "שגיאה בטעינת השער");
        return;
      }

      const status = json.data?.status;
      if (status === "trusted") {
        goReady({
          userName: json.data?.userName,
          hasOpen: Boolean(json.data?.hasOpenRecord),
          checkIn: json.data?.openCheckIn ?? null,
        });
        return;
      }
      if (status === "blocked") {
        setPhase("error");
        setMessage(`המכשיר של ${json.data?.userName ?? "העובד"} חסום ע״י מנהל המערכת`);
        return;
      }

      setPhase("need_register");
      setMessage("מכשיר חדש — נדרשת הרשמה חד-פעמית");
    } catch {
      setPhase("error");
      setMessage("לא ניתן להתחבר לשרת");
    }
  }, [goReady]);

  useEffect(() => {
    if (bootOnceRef.current) return;
    bootOnceRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  const startRegistration = () => {
    if (isAuthenticated && currentUser) {
      void completeRegistration({ id: currentUser.id, name: currentUser.name });
      return;
    }
    setPhase("login");
    setMessage("");
  };

  const completeRegistration = async (user: { id: string; name: string }) => {
    setPhase("registering");
    setMessage("מתחילים הרשמה...");

    try {
      setMessage("מאשרים מיקום GPS...");
      const gps = await captureGpsForVerification();

      const device = captureDeviceInfo();
      const key = deviceKey || getOrCreateDeviceKey();

      setMessage("רושם מכשיר מאושר...");
      const res = await fetch("/api/attendance/gate/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          deviceKey: key,
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          device,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: { message?: string };
      };
      if (!json.success) {
        setPhase("error");
        setMessage(json.error?.message || "רישום המכשיר נכשל");
        return;
      }

      setDeviceKey(key);
      setUserName(user.name);
      // After enrollment — land on clock ready (not auto punch); then punch check-in once
      await submitPunch({ key, action: "check-in", gps });
    } catch (err) {
      if (err instanceof AttendanceVerificationError) {
        failPermission(GPS_REQUIRED_MSG);
        return;
      }
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "רישום המכשיר נכשל");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await login(username, password);
      if (!user) {
        setMessage("שם משתמש או סיסמה שגויים");
        return;
      }
      setUserName(user.name);
      await completeRegistration({ id: user.id, name: user.name });
    } catch {
      setMessage("שם משתמש או סיסמה שגויים");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-4 py-5 border-b border-white/10 text-center space-y-2">
        <p className="text-opal-gold text-xs font-semibold tracking-widest">שעון נוכחות</p>
        <h1 className="text-xl font-bold">{LAB_INFO.name}</h1>
        {userName && phase !== "booting" && (
          <p className="text-slate-300 text-sm">{userName}</p>
        )}
        {(phase === "ready" || phase === "checkout_success" || phase === "punching") && (
          <ShiftBadge inShift={hasOpenRecord} />
        )}
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          {(phase === "booting" || phase === "punching" || phase === "registering") && (
            <CardBox>
              <Loader2 className="h-10 w-10 animate-spin text-opal-gold mx-auto" />
              <p className="text-center mt-4 text-slate-200">{message || "טוען..."}</p>
              {(phase === "punching" || phase === "registering") && (
                <p className="text-center text-xs text-slate-500 mt-2 flex items-center justify-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  GPS · מכשיר · שעת רישום
                </p>
              )}
            </CardBox>
          )}

          {phase === "ready" && (
            <CardBox className="space-y-4">
              {message && (
                <p className="text-center text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 whitespace-pre-line">
                  {message}
                </p>
              )}

              {!hasOpenRecord ? (
                <button
                  type="button"
                  onClick={() => void handlePunchClick("check-in")}
                  className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] transition-all py-7 px-4 text-xl font-black shadow-lg shadow-emerald-900/40"
                >
                  🟢 כניסה
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-2xl bg-emerald-900/50 border border-emerald-500/40 py-6 px-4 text-lg font-bold text-emerald-100 cursor-not-allowed opacity-90"
                  >
                    🟢 נכנסת בשעה {formatAttendanceTime(openCheckIn)}
                  </button>
                  <div className="h-px bg-white/10" />
                  <button
                    type="button"
                    onClick={() => void handlePunchClick("check-out")}
                    className="w-full rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.99] transition-all py-7 px-4 text-xl font-black shadow-lg shadow-red-900/40"
                  >
                    🔴 יציאה
                  </button>
                </>
              )}

              <p className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-1">
                <MapPin className="h-3 w-3" />
                מיקום ומכשיר נשמרים בכל רישום
              </p>
            </CardBox>
          )}

          {phase === "checkout_success" && checkoutSummary && (
            <CardBox className="space-y-4 border-sky-500/40 bg-sky-500/10">
              <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-400" />
              <p className="text-center text-2xl font-black">✅ היציאה בוצעה בהצלחה</p>
              <div className="space-y-2 text-center text-base">
                <p>
                  כניסה:{" "}
                  <span className="font-bold">{formatAttendanceTime(checkoutSummary.checkIn)}</span>
                </p>
                <p>
                  יציאה:{" "}
                  <span className="font-bold">{formatAttendanceTime(checkoutSummary.checkOut)}</span>
                </p>
                <p className="text-lg font-black text-opal-gold mt-2">
                  סה״כ: {formatAttendanceDuration(checkoutSummary.durationHours)} שעות
                </p>
              </div>
              <div className="h-px bg-white/10" />
              <button
                type="button"
                onClick={() => {
                  setCheckoutSummary(null);
                  setHasOpenRecord(false);
                  setOpenCheckIn(null);
                  setPhase("ready");
                  void handlePunchClick("check-in");
                }}
                className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] transition-all py-7 px-4 text-xl font-black shadow-lg shadow-emerald-900/40"
              >
                🟢 כניסה
              </button>
              <Button
                variant="ghost"
                className="w-full text-slate-400"
                onClick={() => goReady({ hasOpen: false, checkIn: null, userName })}
              >
                סגירה
              </Button>
            </CardBox>
          )}

          {phase === "need_register" && (
            <CardBox>
              <Shield className="h-12 w-12 text-opal-gold mx-auto" />
              <h2 className="text-lg font-bold text-center mt-3">הרשמת מכשיר חד-פעמית</h2>
              <p className="text-sm text-slate-400 text-center mt-2">{message}</p>
              <ul className="text-sm text-slate-300 mt-4 space-y-2 list-disc pr-5">
                <li>סריקת QR</li>
                <li>התחברות לחשבון העובד</li>
                <li>אישור GPS</li>
                <li>רישום המכשיר + כניסה ראשונה</li>
              </ul>
              <Button className="w-full mt-6 h-12" onClick={startRegistration}>
                התחלת הרשמה
              </Button>
            </CardBox>
          )}

          {phase === "login" && (
            <CardBox>
              <h2 className="text-lg font-bold text-center">התחברות</h2>
              <p className="text-sm text-slate-400 text-center mt-2">
                פעם אחת בלבד — לאחר מכן השעון זמין במכשיר זה
              </p>
              <form onSubmit={handleLogin} className="space-y-3 mt-4">
                <div>
                  <Label className="text-slate-300">שם משתמש</Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <Label className="text-slate-300">סיסמה</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    autoComplete="current-password"
                    required
                  />
                </div>
                {message && <p className="text-sm text-red-300">{message}</p>}
                <Button type="submit" className="w-full h-11">
                  התחבר והמשך
                </Button>
              </form>
            </CardBox>
          )}

          {phase === "permission_error" && (
            <CardBox className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto" />
              <p className="text-center font-bold mt-3 whitespace-pre-line">{message}</p>
              <p className="text-sm text-amber-100/80 mt-3 text-center">{detail}</p>
              <div className="flex flex-col gap-2 mt-6">
                <Button
                  className="h-11"
                  onClick={() => {
                    resetGatePunchLock();
                    bootOnceRef.current = false;
                    void bootstrap();
                  }}
                >
                  נסה שוב
                </Button>
              </div>
            </CardBox>
          )}

          {phase === "error" && (
            <CardBox className="border-red-500/40 bg-red-500/10">
              <AlertTriangle className="h-12 w-12 text-red-400 mx-auto" />
              <p className="text-center mt-3">{message}</p>
              <Button
                className="w-full mt-6 h-11"
                onClick={() => {
                  resetGatePunchLock();
                  bootOnceRef.current = false;
                  void bootstrap();
                }}
              >
                טען מחדש
              </Button>
            </CardBox>
          )}

          {isAuthenticated && currentUser && phase !== "checkout_success" && (
            <p className="text-center text-xs text-slate-500">
              מחובר כ־{currentUser.name}{" "}
              <button type="button" className="underline text-slate-400" onClick={() => void logout()}>
                התנתק
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function ShiftBadge({ inShift }: { inShift: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold border",
        inShift
          ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
          : "bg-white/5 border-white/15 text-slate-300",
      )}
    >
      {inShift ? "🟢 נמצא במשמרת" : "⚪ לא במשמרת"}
    </div>
  );
}

function CardBox({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl", className)}>
      {children}
    </div>
  );
}
