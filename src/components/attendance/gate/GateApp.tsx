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
import {
  attachStreamToVideo,
  capturePhotoFromVideo,
  isVideoReadyForCapture,
  releaseCamera,
  requestFrontCameraStream,
} from "@/lib/attendance/verification/camera";
import { uploadVerificationPhoto } from "@/lib/attendance/verification/upload";
import { AttendanceVerificationError } from "@/lib/attendance/verification/types";
import { permissionHelpText } from "@/lib/attendance/gate/open-settings";
import {
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Camera,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Phase =
  | "booting"
  | "choose"
  | "punch_gps"
  | "punch_camera"
  | "punching"
  | "success"
  | "need_register"
  | "login"
  | "register_gps"
  | "register_camera"
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
  const [hasOpenRecord, setHasOpenRecord] = useState(false);
  const [intendedAction, setIntendedAction] = useState<GatePunchAction | null>(null);
  const [gpsSnap, setGpsSnap] = useState<GpsSnapshot | null>(null);
  const [lastAction, setLastAction] = useState<GatePunchAction | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bootOnceRef = useRef(false);

  const failPermission = useCallback((msg: string) => {
    setMessage(msg);
    setDetail(permissionHelpText());
    setPhase("permission_error");
  }, []);

  const cleanupCamera = useCallback(() => {
    try {
      releaseCamera(videoRef.current, streamRef.current);
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    setStream(null);
    setVideoReady(false);
  }, []);

  const applyPunchSuccess = useCallback(
    (data: { action: GatePunchAction; userName: string; message: string }) => {
      setLastAction(data.action);
      setUserName(data.userName);
      setMessage(data.message);
      setHasOpenRecord(data.action === "check-in");
      setPhase("success");
    },
    [],
  );

  const startCamera = useCallback(async () => {
    setVideoReady(false);
    const s = await requestFrontCameraStream();
    streamRef.current = s;
    setStream(s);
    if (videoRef.current) {
      await attachStreamToVideo(videoRef.current, s);
      setVideoReady(isVideoReadyForCapture(videoRef.current));
    }
  }, []);

  const submitPunch = useCallback(
    async (opts: {
      key: string;
      action: GatePunchAction;
      gps: GpsSnapshot;
      photoPath?: string | null;
      userIdForUpload?: string;
    }) => {
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
              photoPath: opts.photoPath ?? null,
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
          failPermission(err instanceof Error ? err.message : "נדרש אישור GPS");
          return;
        }
        resetGatePunchLock();
        setPhase("error");
        setMessage(err instanceof Error ? err.message : "שגיאה ברישום נוכחות");
      }
    },
    [applyPunchSuccess, failPermission],
  );

  const beginAction = useCallback(
    async (action: GatePunchAction) => {
      const key = deviceKey || getOrCreateDeviceKey();
      setIntendedAction(action);
      setGpsSnap(null);
      cleanupCamera();
      resetGatePunchLock();
      setPhase("punch_gps");
      setMessage("מאשרים מיקום GPS...");

      try {
        const gps = await captureGpsForVerification();
        setGpsSnap(gps);
        setPhase("punch_camera");
        setMessage(
          action === "check-in"
            ? "צלמו סלפי לאישור כניסה"
            : "צלמו סלפי לאישור יציאה (אופציונלי)",
        );
        try {
          await startCamera();
        } catch (err) {
          cleanupCamera();
          if (action === "check-out") {
            // Checkout photo is optional — continue without camera.
            await submitPunch({ key, action, gps, photoPath: null });
            return;
          }
          failPermission(
            err instanceof Error ? err.message : "נדרשת הרשאת מצלמה לכניסה",
          );
        }
      } catch (err) {
        if (err instanceof AttendanceVerificationError) {
          failPermission(err.message);
          return;
        }
        failPermission("נדרש אישור GPS לרישום נוכחות");
      }
    },
    [cleanupCamera, deviceKey, failPermission, startCamera, submitPunch],
  );

  const bootstrap = useCallback(async () => {
    setPhase("booting");
    cleanupCamera();
    setIntendedAction(null);
    setGpsSnap(null);
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
        setHasOpenRecord(Boolean(json.data?.hasOpenRecord));
        setPhase("choose");
        setMessage("");
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
  }, [cleanupCamera, applyPunchSuccess]);

  useEffect(() => {
    if (bootOnceRef.current) return;
    bootOnceRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    return () => {
      try {
        releaseCamera(videoRef.current, streamRef.current);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const bindVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (!node || !streamRef.current) {
      setVideoReady(false);
      return;
    }

    void (async () => {
      try {
        await attachStreamToVideo(node, streamRef.current!);
        setVideoReady(isVideoReadyForCapture(node));
      } catch {
        setVideoReady(false);
        setMessage("המצלמה לא מוכנה — נסו שוב");
      }
    })();
  }, []);

  const startRegistration = () => {
    if (isAuthenticated && currentUser) {
      setPhase("register_gps");
      setMessage("מאשרים מיקום GPS...");
      void doRegisterGps();
      return;
    }
    setPhase("login");
  };

  const doRegisterGps = async () => {
    try {
      setPhase("register_gps");
      await captureGpsForVerification();
      setPhase("register_camera");
      setMessage("צלמו סלפי לאימות חד-פעמי");
      try {
        await startCamera();
      } catch (err) {
        cleanupCamera();
        failPermission(
          err instanceof Error ? err.message : "נדרשת הרשאת מצלמה לרישום המכשיר",
        );
      }
    } catch (err) {
      if (err instanceof AttendanceVerificationError) {
        failPermission(err.message);
        return;
      }
      failPermission("נדרש אישור GPS לרישום המכשיר");
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
      await doRegisterGps();
    } catch {
      setMessage("שם משתמש או סיסמה שגויים");
    }
  };

  const completeRegistration = async () => {
    const video = videoRef.current;
    if (!currentUser) return;
    if (!video || !isVideoReadyForCapture(video)) {
      setMessage("המצלמה עדיין לא מוכנה — המתינו רגע ונסו שוב");
      return;
    }

    setCapturing(true);
    setMessage("מצלם...");
    try {
      const photo = await capturePhotoFromVideo(video);
      cleanupCamera();

      setPhase("registering");
      setMessage("שומר מכשיר מאושר...");

      const gps = await captureGpsForVerification();
      const uploaded = await uploadVerificationPhoto(photo.blob, currentUser.id, "check-in");
      const device = captureDeviceInfo();
      const key = deviceKey || getOrCreateDeviceKey();

      const res = await fetch("/api/attendance/gate/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          deviceKey: key,
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          photoPath: uploaded.photoPath,
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
      setHasOpenRecord(false);
      setPhase("choose");
      setMessage("המכשיר נרשם — בחרו כניסה או יציאה");
    } catch (err) {
      cleanupCamera();
      if (err instanceof AttendanceVerificationError) {
        if (err.step === "gps" || err.step === "camera" || err.step === "capturing") {
          failPermission(err.message);
          return;
        }
      }
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "רישום המכשיר נכשל");
    } finally {
      setCapturing(false);
    }
  };

  const completePunchPhoto = async () => {
    const video = videoRef.current;
    const action = intendedAction;
    const gps = gpsSnap;
    const key = deviceKey || getOrCreateDeviceKey();
    if (!action || !gps) {
      setPhase("error");
      setMessage("חסרים נתוני פעולה או GPS");
      return;
    }
    if (!video || !isVideoReadyForCapture(video)) {
      setMessage("המצלמה עדיין לא מוכנה — המתינו רגע ונסו שוב");
      return;
    }

    setCapturing(true);
    setMessage("מצלם...");
    try {
      const photo = await capturePhotoFromVideo(video);
      cleanupCamera();

      const form = new FormData();
      form.append("file", photo.blob, "selfie.jpg");
      form.append("deviceKey", key);
      form.append("kind", action);
      const up = await fetch("/api/attendance/gate/photo", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const upJson = (await up.json()) as {
        success?: boolean;
        data?: { photoPath?: string };
        error?: { message?: string };
      };
      if (!upJson.success || !upJson.data?.photoPath) {
        throw new Error(upJson.error?.message || "העלאת התמונה נכשלה");
      }

      await submitPunch({ key, action, gps, photoPath: upJson.data.photoPath });
    } catch (err) {
      cleanupCamera();
      if (err instanceof AttendanceVerificationError) {
        failPermission(err.message);
        return;
      }
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "צילום/רישום נכשל");
    } finally {
      setCapturing(false);
    }
  };

  const skipPunchPhoto = async () => {
    if (intendedAction !== "check-out" || !gpsSnap) return;
    cleanupCamera();
    const key = deviceKey || getOrCreateDeviceKey();
    await submitPunch({
      key,
      action: "check-out",
      gps: gpsSnap,
      photoPath: null,
    });
  };

  const showRegisterCamera = phase === "register_camera";
  const showPunchCamera = phase === "punch_camera";

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-4 py-5 border-b border-white/10 text-center">
        <p className="text-opal-gold text-xs font-semibold tracking-widest">שער נוכחות</p>
        <h1 className="text-xl font-bold mt-1">{LAB_INFO.name}</h1>
        <p className="text-slate-400 text-sm mt-1">/attendance/checkin · QR / NFC</p>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          {(phase === "booting" ||
            phase === "punch_gps" ||
            phase === "punching" ||
            phase === "registering") && (
            <CardBox>
              <Loader2 className="h-10 w-10 animate-spin text-opal-gold mx-auto" />
              <p className="text-center mt-4 text-slate-200">{message || "טוען..."}</p>
            </CardBox>
          )}

          {phase === "choose" && (
            <CardBox className="space-y-4">
              {userName && (
                <p className="text-center text-slate-300">
                  שלום, <span className="font-bold text-white">{userName}</span>
                </p>
              )}
              <p className="text-center text-sm text-slate-400">
                {hasOpenRecord
                  ? "יש לכם כניסה פתוחה — ניתן לבצע יציאה"
                  : "בחרו פעולה להמשך"}
              </p>
              {message && <p className="text-center text-sm text-emerald-300">{message}</p>}

              <button
                type="button"
                onClick={() => void beginAction("check-in")}
                className="w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white py-7 px-7 shadow-lg shadow-emerald-900/40 transition"
              >
                <LogIn className="h-10 w-10 mx-auto mb-2" />
                <span className="block text-2xl font-black tracking-wide">כניסה לעבודה</span>
                <span className="block text-sm text-emerald-50/90 mt-1">GPS · סלפי · רישום שעה</span>
              </button>

              <button
                type="button"
                onClick={() => void beginAction("check-out")}
                className="w-full rounded-2xl bg-red-500 hover:bg-red-400 active:bg-red-600 text-white py-7 px-4 shadow-lg shadow-red-900/40 transition"
              >
                <LogOut className="h-10 w-10 mx-auto mb-2" />
                <span className="block text-2xl font-black tracking-wide">יציאה מהעבודה</span>
                <span className="block text-sm text-red-50/90 mt-1">GPS · סלפי (אופציונלי) · סגירת יום</span>
              </button>
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
              <CheckCircle2
                className={cn(
                  "h-16 w-16 mx-auto",
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
                  cleanupCamera();
                  setIntendedAction(null);
                  setGpsSnap(null);
                  setPhase("choose");
                  setMessage("");
                }}
              >
                חזרה לתפריט
              </Button>
            </CardBox>
          )}

          {phase === "need_register" && (
            <CardBox>
              <Shield className="h-12 w-12 text-opal-gold mx-auto" />
              <h2 className="text-lg font-bold text-center mt-3">הרשמת מכשיר חד-פעמית</h2>
              <p className="text-sm text-slate-400 text-center mt-2">{message}</p>
              <ul className="text-sm text-slate-300 mt-4 space-y-2 list-disc pr-5">
                <li>התחברות לחשבון העובד</li>
                <li>אישור GPS</li>
                <li>צילום סלפי</li>
                <li>שמירת המכשיר כאמין</li>
              </ul>
              <Button className="w-full mt-6" onClick={startRegistration}>
                התחלת הרשמה
              </Button>
            </CardBox>
          )}

          {phase === "login" && (
            <CardBox>
              <h2 className="text-lg font-bold text-center">התחברות</h2>
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
                  המשך לאימות
                </Button>
              </form>
            </CardBox>
          )}

          {phase === "register_gps" && (
            <CardBox>
              <MapPin className="h-10 w-10 text-sky-400 mx-auto" />
              <p className="text-center mt-3">{message || "מבקש מיקום..."}</p>
            </CardBox>
          )}

          {(showRegisterCamera || showPunchCamera) && (
            <CardBox>
              <Camera
                className={cn(
                  "h-8 w-8 mx-auto mb-2",
                  intendedAction === "check-out" && showPunchCamera
                    ? "text-red-400"
                    : "text-opal-gold",
                )}
              />
              <p className="text-center text-sm text-slate-300 mb-1">
                {showPunchCamera
                  ? intendedAction === "check-in"
                    ? "כניסה לעבודה"
                    : "יציאה מהעבודה"
                  : "הרשמת מכשיר"}
              </p>
              <p className="text-center text-sm text-slate-400 mb-3">{message}</p>
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-black">
                <video
                  ref={bindVideoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full object-cover"
                />
              </div>
              {!videoReady && stream && (
                <p className="text-center text-xs text-slate-400 mt-2 flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  מצלמה נטענת...
                </p>
              )}
              {showRegisterCamera && (
                <Button
                  className="w-full mt-4"
                  disabled={!videoReady || capturing || !stream}
                  onClick={() => void completeRegistration()}
                >
                  {capturing ? "מצלם..." : videoReady ? "צלם ושמור מכשיר מאושר" : "ממתין למצלמה..."}
                </Button>
              )}
              {showPunchCamera && (
                <div className="flex flex-col gap-2 mt-4">
                  <Button
                    className={cn(
                      "w-full",
                      intendedAction === "check-out"
                        ? "bg-red-500 hover:bg-red-400"
                        : "bg-emerald-500 hover:bg-emerald-400",
                    )}
                    disabled={!videoReady || capturing || !stream}
                    onClick={() => void completePunchPhoto()}
                  >
                    {capturing
                      ? "מצלם..."
                      : intendedAction === "check-in"
                        ? "צלם ואשר כניסה"
                        : "צלם ואשר יציאה"}
                  </Button>
                  {intendedAction === "check-out" && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={capturing}
                      onClick={() => void skipPunchPhoto()}
                    >
                      יציאה ללא תמונה
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="w-full text-slate-400"
                    disabled={capturing}
                    onClick={() => {
                      cleanupCamera();
                      setPhase("choose");
                      setMessage("");
                    }}
                  >
                    ביטול
                  </Button>
                </div>
              )}
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
                  הוראות לפתיחת הגדרות המכשיר
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
                  setPhase("choose");
                  setMessage("");
                }}
              >
                חזרה לתפריט
              </Button>
              <Button
                className="w-full mt-2"
                variant="outline"
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
