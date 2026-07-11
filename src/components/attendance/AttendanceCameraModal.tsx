"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, CheckCircle2, MapPin, X } from "lucide-react";
import { captureStillFromVideo, requestCameraStream, stopMediaStream } from "@/lib/attendance/attendance-camera";
import { uploadAttendancePhoto } from "@/lib/attendance/attendance-upload";

interface AttendanceCameraModalProps {
  open: boolean;
  onClose: () => void;
  mode: "check-in" | "check-out";
  userId: string;
  onVerified: (photo: { photoUrl: string | null; photoPath: string; fileName: string }) => Promise<void> | void;
}

type ModalStep = "gps" | "camera" | "preview" | "uploading" | "done" | "error";

export function AttendanceCameraModal({ open, onClose, mode, userId, onVerified }: AttendanceCameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [step, setStep] = useState<ModalStep>("gps");
  const [message, setMessage] = useState("בודק מיקום...");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!open) {
      stopMediaStream(stream);
      setStep("gps");
      setMessage("בודק מיקום...");
      setError(null);
      setPreviewUrl(null);
      setBlob(null);
      return;
    }

    let cancelled = false;
    const runFlow = async () => {
      setStep("gps");
      setMessage("בודק מיקום...");
      setError(null);
      try {
        await new Promise<void>((resolve, reject) => {
          if (typeof navigator === "undefined" || !navigator.geolocation) {
            reject(new Error("לא ניתן לקבל מיקום."));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            () => reject(new Error("לא ניתן לקבל מיקום.")),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          );
        });
        if (cancelled) return;

        setStep("camera");
        setMessage("פותח מצלמה...");
        const cameraStream = await requestCameraStream();
        if (cancelled) {
          stopMediaStream(cameraStream);
          return;
        }
        setStream(cameraStream);
        if (videoRef.current) {
          videoRef.current.srcObject = cameraStream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStep("preview");
        setMessage("הסר/הוספת צילום");
      } catch (err) {
        if (cancelled) return;
        setStep("error");
        setError(err instanceof Error ? err.message : "לא ניתן לבצע רישום ללא צילום.");
      }
    };

    void runFlow();
    return () => {
      cancelled = true;
      stopMediaStream(stream);
    };
  }, [open, stream]);

  const closeModal = () => {
    stopMediaStream(stream);
    onClose();
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    try {
      const result = await captureStillFromVideo(videoRef.current);
      setBlob(result.blob);
      setPreviewUrl(result.dataUrl);
      setStep("preview");
      setMessage("צילום מוכן לאישור");
    } catch {
      setError("לא ניתן לבצע רישום ללא צילום.");
      setStep("error");
    }
  };

  const handleConfirm = async () => {
    if (!blob) {
      setError("לא ניתן לבצע רישום ללא צילום.");
      setStep("error");
      return;
    }

    setStep("uploading");
    setMessage("מעלה תמונה...");
    try {
      const uploaded = await uploadAttendancePhoto(blob, userId, mode);
      await onVerified(uploaded);
      setStep("done");
      setMessage("✔ הנוכחות נרשמה בהצלחה");
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "שגיאה בהעלאת התמונה.");
    }
  };

  const title = mode === "check-in" ? "צילום כניסה" : "צילום יציאה";
  const canCapture = step === "preview" || step === "camera";

  return (
    <Modal open={open} onClose={closeModal} title={title} className="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <div className="flex items-center gap-2 font-medium text-slate-700"><MapPin className="h-4 w-4" />{message}</div>
          {error && <p className="mt-2 text-red-600">{error}</p>}
        </div>

        {step === "camera" || step === "preview" ? (
          <div className="rounded-2xl border overflow-hidden bg-black">
            {previewUrl ? (
              <img src={previewUrl} alt="preview" className="w-full h-[420px] object-cover" />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-[420px] object-cover" />
            )}
          </div>
        ) : step === "uploading" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
            <p className="mt-3 font-medium text-emerald-700">מעלה תמונה...</p>
          </div>
        ) : step === "done" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-3 font-medium text-emerald-700">✔ הנוכחות נרשמה בהצלחה</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 justify-end">
          {step === "preview" && (
            <>
              <Button type="button" variant="outline" onClick={() => { setPreviewUrl(null); setBlob(null); setStep("camera"); setMessage("פותח מצלמה..."); }}>
                צילום מחדש
              </Button>
              <Button type="button" onClick={handleConfirm}>אישור</Button>
            </>
          )}

          {(step === "camera" || step === "preview") && !previewUrl && (
            <Button type="button" onClick={handleCapture}>
              <Camera className="mr-2 h-4 w-4" />צילום
            </Button>
          )}

          {step === "camera" && previewUrl && (
            <Button type="button" onClick={handleCapture}>
              <Camera className="mr-2 h-4 w-4" />צילום
            </Button>
          )}

          {step !== "done" && (
            <Button type="button" variant="outline" onClick={closeModal}>
              <X className="mr-2 h-4 w-4" />ביטול
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
