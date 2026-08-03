"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAB_INFO } from "@/lib/constants/labels";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { getOrCreateDeviceKey } from "@/lib/attendance/gate/device-key";
import {
  peekGatePunchResult,
  resetGatePunchLock,
  runGatePunchOnce,
  type GatePunchAction,
} from "@/lib/attendance/gate/punch-lock";
import { captureGpsForVerification } from "@/lib/attendance/verification/gps";
import { captureDeviceInfo } from "@/lib/attendance/verification/device";
import { AttendanceVerificationError } from "@/lib/attendance/verification/types";
import { permissionHelpText } from "@/lib/attendance/gate/open-settings";
import {
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const GPS_REQUIRED_MSG = "יש לאשר הרשאת מיקום כדי לבצע רישום נוכחות.";

type Phase =
  | "booting"
  | "punching"
  | "success"
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

export function GateApp() {
  const { login, currentUser, isAuthenticated, logout } = useApp();

  const [phase, setPhase] = useState<Phase>("booting");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [lastAction, setLastAction] = useState<GatePunchAction | null>(null);
  const bootOnceRef = useRef(false);

  const failPermission = useCallback((msg?: string) => {
    setMessage(msg || GPS_REQUIRED_MSG);
    setDetail(permissionHelpText());
    setPhase("permission_error");
  }, []);

  const applyPunchSuccess = useCallback(
    (data: { action: GatePunchAction; userName: string; message: string }) => {
      setLastAction(data.action);
      setUserName(data.userName);
      setMessage(data.message);
      setPhase("success");
    },
    [],
  );

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
          };
        });

        applyPunchSuccess(result);
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
    [applyPunchSuccess, failPermission],
  );

  /** Daily QR: GPS → auto check-in or check-out (no camera, no choose screen). */
  const beginAutoPunch = useCallback(
    async (hasOpenRecord: boolean) => {
      const key = deviceKey || getOrCreateDeviceKey();
      const action: GatePunchAction = hasOpenRecord ? "check-out" : "check-in";
      setPhase("punching");
      setMessage("מאשרים מיקום GPS...");
      resetGatePunchLock();

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
    [deviceKey, failPermission, submitPunch],
  );

  const bootstrap = useCallback(async () => {
    setPhase("booting");
    setMessage("טוען שער נוכחות...");
    const key = getOrCreateDeviceKey();
    setDeviceKey(key);

    const already = peekGatePunchResult();
    if (already) {
      applyPunchSuccess(already);
      return;
    }

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
        setUserName(json.data?.userName ?? "");
        void beginAutoPunch(Boolean(json.data?.hasOpenRecord));
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
  }, [applyPunchSuccess, beginAutoPunch]);

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
      // First enrollment → automatic check-in
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
      <header className="px-4 py-5 border-b border-white/10 text-center">
        <p className="text-opal-gold text-xs font-semibold tracking-widest">שער נוכחות</p>
        <h1 className="text-xl font-bold mt-1">{LAB_INFO.name}</h1>
        <p className="text-slate-400 text-sm mt-1">/attendance/checkin · QR בלבד</p>
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
                  GPS חובה · ללא צילום
                </p>
              )}
            </CardBox>
          )}

          {phase === "success" && (
            <CardBox
              className={
                lastAction === "check-out"
                  ? "border-sky-500/40 bg-sky-500/10"
                  : "border-emerald-500/40 bg-emerald-500/10"
              }
            >
              {lastAction === "check-out" ? (
                <LogOut className="h-16 w-16 mx-auto text-sky-300" />
              ) : (
                <LogIn className="h-16 w-16 mx-auto text-emerald-400" />
              )}
              <CheckCircle2
                className={cn(
                  "h-8 w-8 mx-auto mt-2",
                  lastAction === "check-out" ? "text-sky-300" : "text-emerald-400",
                )}
              />
              <p className="text-center text-2xl font-black mt-4">
                {lastAction === "check-out" ? "יציאה נרשמה בהצלחה" : "כניסה נרשמה בהצלחה"}
              </p>
              <p className="text-center text-lg font-semibold mt-2">{userName}</p>
              {message && (
                <p
                  className={cn(
                    "text-center mt-2 text-sm",
                    lastAction === "check-out" ? "text-sky-100" : "text-emerald-200",
                  )}
                >
                  {message}
                </p>
              )}
              <Button
                className="w-full mt-6"
                variant="outline"
                onClick={() => {
                  resetGatePunchLock();
                  bootOnceRef.current = false;
                  void bootstrap();
                }}
              >
                סריקה נוספת
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
                <li>רישום המכשיר כמאושר + כניסה אוטומטית</li>
              </ul>
              <Button className="w-full mt-6" onClick={startRegistration}>
                התחלת הרשמה
              </Button>
            </CardBox>
          )}

          {phase === "login" && (
            <CardBox>
              <h2 className="text-lg font-bold text-center">התחברות</h2>
              <p className="text-sm text-slate-400 text-center mt-2">
                פעם אחת בלבד — לאחר מכן סריקת QR מספיקה
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
                <Button type="submit" className="w-full">
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
                  onClick={() => {
                    resetGatePunchLock();
                    bootOnceRef.current = false;
                    void bootstrap();
                  }}
                >
                  נסה שוב
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetail(permissionHelpText());
                    alert(permissionHelpText());
                  }}
                >
                  הוראות לפתיחת הגדרות המיקום
                </Button>
              </div>
            </CardBox>
          )}

          {phase === "error" && (
            <CardBox className="border-red-500/40 bg-red-500/10">
              <AlertTriangle className="h-12 w-12 text-red-400 mx-auto" />
              <p className="text-center mt-3">{message}</p>
              <Button
                className="w-full mt-6"
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

          {isAuthenticated && currentUser && phase !== "success" && (
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
