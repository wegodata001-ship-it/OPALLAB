"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LAB_INFO } from "@/lib/constants/labels";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/providers/AppProvider";
import { getOrCreateDeviceKey } from "@/lib/attendance/gate/device-key";
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
import { CheckCircle2, Loader2, MapPin, Camera, Shield, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase =
  | "booting"
  | "punching"
  | "success"
  | "need_register"
  | "login"
  | "register_gps"
  | "register_camera"
  | "registering"
  | "permission_error"
  | "error";

export function GateApp() {
  useSearchParams(); // keep Suspense boundary stable for /attendance/checkin
  const { login, currentUser, isAuthenticated, logout } = useApp();

  const [phase, setPhase] = useState<Phase>("booting");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  const runPunch = useCallback(async (key: string) => {
    setPhase("punching");
    setMessage("מזהה מכשיר ומבקש מיקום...");
    try {
      const gps = await captureGpsForVerification();
      const device = captureDeviceInfo();
      const res = await fetch("/api/attendance/gate/punch", {
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
        data?: { action: string; userName: string; message: string };
        error?: { message?: string; details?: { code?: string } | null };
      };

      if (!json.success) {
        const code =
          json.error?.details && typeof json.error.details === "object"
            ? json.error.details.code
            : undefined;
        if (code === "DEVICE_UNKNOWN" || code === "DEVICE_REVOKED" || res.status === 404) {
          setPhase("need_register");
          setMessage(json.error?.message || "נדרשת הרשמה חד-פעמית למכשיר זה");
          return;
        }
        if (code === "GPS_REQUIRED" || json.error?.message?.includes("מיקום")) {
          failPermission(json.error?.message || "נדרש אישור GPS");
          return;
        }
        setPhase("error");
        setMessage(json.error?.message || "רישום הנוכחות נכשל");
        return;
      }

      setUserName(json.data?.userName ?? "");
      setMessage(json.data?.message ?? "הנוכחות נרשמה");
      setPhase("success");
    } catch (err) {
      if (err instanceof AttendanceVerificationError && err.step === "gps") {
        failPermission(err.message);
        return;
      }
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "שגיאה ברישום נוכחות");
    }
  }, [failPermission]);

  const bootstrap = useCallback(async () => {
    setPhase("booting");
    cleanupCamera();
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
        await runPunch(key);
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
  }, [runPunch, cleanupCamera]);

  useEffect(() => {
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

  /** Bind stream when the <video> mounts — critical on iOS where ref is null until paint. */
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
      setVideoReady(false);
      try {
        const s = await requestFrontCameraStream();
        streamRef.current = s;
        setStream(s);
        // If video already mounted (race), attach immediately
        if (videoRef.current) {
          await attachStreamToVideo(videoRef.current, s);
          setVideoReady(isVideoReadyForCapture(videoRef.current));
        }
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
    // Snapshot the element BEFORE any phase change — switching to "registering"
    // unmounts <video> and clears the ref (Safari: null.readyState crash).
    const video = videoRef.current;
    if (!currentUser) return;
    if (!video || !isVideoReadyForCapture(video)) {
      setMessage("המצלמה עדיין לא מוכנה — המתינו רגע ונסו שוב");
      return;
    }

    setCapturing(true);
    setMessage("מצלם...");
    try {
      // Capture FIRST while the video element is still mounted and has frames
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

      setMessage("המכשיר נרשם בהצלחה — מבצעים כניסה...");
      await runPunch(key);
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

  const showCamera = phase === "register_camera";

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-4 py-5 border-b border-white/10 text-center">
        <p className="text-opal-gold text-xs font-semibold tracking-widest">שער נוכחות</p>
        <h1 className="text-xl font-bold mt-1">{LAB_INFO.name}</h1>
        <p className="text-slate-400 text-sm mt-1">/attendance/checkin · QR / NFC</p>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          {(phase === "booting" || phase === "punching" || phase === "registering") && (
            <CardBox>
              <Loader2 className="h-10 w-10 animate-spin text-opal-gold mx-auto" />
              <p className="text-center mt-4 text-slate-200">{message || "טוען..."}</p>
            </CardBox>
          )}

          {phase === "success" && (
            <CardBox className="border-emerald-500/40 bg-emerald-500/10">
              <CheckCircle2 className="h-14 w-14 text-emerald-400 mx-auto" />
              <p className="text-center text-xl font-bold mt-3">{userName}</p>
              <p className="text-center text-emerald-200 mt-2">{message}</p>
              <Button className="w-full mt-6" variant="outline" onClick={() => void bootstrap()}>
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

          {showCamera && (
            <CardBox>
              <Camera className="h-8 w-8 text-opal-gold mx-auto mb-2" />
              <p className="text-center text-sm text-slate-300 mb-3">{message}</p>
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
              <Button
                className="w-full mt-4"
                disabled={!videoReady || capturing || !stream}
                onClick={() => void completeRegistration()}
              >
                {capturing ? "מצלם..." : videoReady ? "צלם ושמור מכשיר מאושר" : "ממתין למצלמה..."}
              </Button>
            </CardBox>
          )}

          {phase === "permission_error" && (
            <CardBox className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto" />
              <p className="text-center font-bold mt-3 whitespace-pre-line">{message}</p>
              <p className="text-sm text-amber-100/80 mt-3 text-center">{detail}</p>
              <div className="flex flex-col gap-2 mt-6">
                <Button onClick={() => void bootstrap()}>נסה שוב</Button>
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
              <Button className="w-full mt-6" onClick={() => void bootstrap()}>
                נסה שוב
              </Button>
              <Button
                className="w-full mt-2"
                variant="outline"
                onClick={() => {
                  setPhase("need_register");
                  setMessage("הרשמת מכשיר מחדש");
                }}
              >
                הרשמת מכשיר מחדש
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
