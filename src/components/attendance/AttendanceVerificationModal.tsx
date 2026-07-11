"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Loader2, Camera, CheckCircle2, X } from "lucide-react";
import {
  AttendanceVerificationError,
  VERIFICATION_STEP_MESSAGES,
  attachStreamToVideo,
  buildVerificationPayload,
  captureDeviceInfo,
  captureGpsForVerification,
  capturePhotoFromVideo,
  isVideoReadyForCapture,
  releaseCamera,
  requestFrontCameraStream,
  toAttendanceMeta,
  uploadVerificationPhoto,
  type DeviceCaptureResult,
  type GpsCaptureResult,
  type PhotoCaptureResult,
  type PhotoUploadResult,
  type VerificationKind,
  type VerificationStep,
} from "@/lib/attendance/verification";
import { attendanceFlowLog, cameraPerfCheck, cameraPerfMark, cameraPerfStart } from "@/lib/attendance/verification/camera-debug";

interface AttendanceVerificationModalProps {
  open: boolean;
  onClose: () => void;
  kind: VerificationKind;
  userId: string;
  isCheckOut: boolean;
  onSubmit: (meta: ReturnType<typeof toAttendanceMeta>) => Promise<void>;
}

const LOADING_STEPS: VerificationStep[] = ["gps", "capturing", "uploading", "saving"];

export function AttendanceVerificationModal({
  open,
  onClose,
  kind,
  userId,
  isCheckOut,
  onSubmit,
}: AttendanceVerificationModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gpsRef = useRef<GpsCaptureResult | null>(null);
  const deviceRef = useRef<DeviceCaptureResult | null>(null);

  const [step, setStep] = useState<VerificationStep>("gps");
  const [message, setMessage] = useState(VERIFICATION_STEP_MESSAGES.gps);
  const [error, setError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState<PhotoCaptureResult | null>(null);

  const stepRef = useRef<VerificationStep>("gps");

  const revokePreviewUrl = useCallback((photo: PhotoCaptureResult | null) => {
    if (photo?.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(photo.previewUrl);
    }
  }, []);

  /** Stops camera stream only — does NOT clear captured photo. */
  const releaseCameraOnly = useCallback(() => {
    releaseCamera(videoRef.current, streamRef.current);
    streamRef.current = null;
    setVideoReady(false);
  }, []);

  const resetAll = useCallback(() => {
    releaseCameraOnly();
    videoRef.current = null;
    setCapturedPhoto((prev) => {
      revokePreviewUrl(prev);
      return null;
    });
    gpsRef.current = null;
    deviceRef.current = null;
    setStep("gps");
    setMessage(VERIFICATION_STEP_MESSAGES.gps);
    setError(null);
  }, [releaseCameraOnly, revokePreviewUrl]);

  const handleClose = useCallback(() => {
    attendanceFlowLog("Dialog Closed");
    resetAll();
    onClose();
  }, [onClose, resetAll]);

  const fail = useCallback((err: unknown, phase: string) => {
    const msg =
      err instanceof AttendanceVerificationError
        ? err.message
        : err instanceof Error
          ? err.message
          : "רישום הנוכחות נכשל.\n\nנסה שוב.";
    attendanceFlowLog("error", { phase, message: msg });
    setError(msg);
    setStep("error");
    setMessage(VERIFICATION_STEP_MESSAGES.error);
    releaseCameraOnly();
  }, [releaseCameraOnly]);

  useEffect(() => {
    if (stepRef.current === step) return;
    attendanceFlowLog(`state: ${stepRef.current} → ${step}`);
    cameraPerfMark(`Step transition: ${stepRef.current} → ${step}`, { step });
    stepRef.current = step;
  }, [step]);

  // Step 1: GPS
  useEffect(() => {
    if (!open) {
      resetAll();
      return;
    }

    attendanceFlowLog("Modal Open");
    let cancelled = false;

    void (async () => {
      setStep("gps");
      setMessage(VERIFICATION_STEP_MESSAGES.gps);
      setError(null);
      try {
        const gps = await captureGpsForVerification();
        const device = captureDeviceInfo();
        if (cancelled) return;
        gpsRef.current = gps;
        deviceRef.current = device;
        setCameraKey((k) => k + 1);
        setStep("camera");
        setMessage(VERIFICATION_STEP_MESSAGES.camera);
        attendanceFlowLog("Camera Started");
      } catch (err) {
        if (!cancelled) fail(err, "gps");
      }
    })();

    return () => {
      cancelled = true;
      releaseCameraOnly();
    };
  }, [open, retryKey, resetAll, releaseCameraOnly, fail]);

  const handleRetry = useCallback(() => {
    resetAll();
    setCameraKey((k) => k + 1);
    setRetryKey((k) => k + 1);
  }, [resetAll]);

  const bindVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (!node || step !== "camera" || !streamRef.current) return;

      void (async () => {
        try {
          await attachStreamToVideo(node, streamRef.current!);
          setVideoReady(isVideoReadyForCapture(node));
        } catch (err) {
          fail(err, "camera-bind");
        }
      })();
    },
    [step, fail],
  );

  useEffect(() => {
    if (!open || step !== "camera") return;

    let cancelled = false;

    void (async () => {
      try {
        releaseCameraOnly();
        const stream = await requestFrontCameraStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          await attachStreamToVideo(videoRef.current, stream);
          if (!cancelled) setVideoReady(isVideoReadyForCapture(videoRef.current));
        }
      } catch (err) {
        if (!cancelled) fail(err, "camera");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, step, cameraKey, releaseCameraOnly, fail]);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !videoReady) return;

    setStep("capturing");
    setMessage(VERIFICATION_STEP_MESSAGES.capturing);

    try {
      const result = await capturePhotoFromVideo(video);
      attendanceFlowLog("Photo Captured", { blobSizeBytes: result.blob.size });

      setCapturedPhoto((prev) => {
        revokePreviewUrl(prev);
        return result;
      });

      releaseCameraOnly();
      videoRef.current = null;

      setStep("preview");
      setMessage(VERIFICATION_STEP_MESSAGES.preview);
      attendanceFlowLog("Preview Ready", {
        previewUrl: result.previewUrl.slice(0, 40),
        hasBlob: Boolean(result.blob),
      });
      cameraPerfCheck("preview state committed", {
        step: "preview",
        capturedPhotoSet: true,
        previewUsesObjectUrl: result.previewUrl.startsWith("blob:"),
      });
    } catch (err) {
      fail(err, "capturing");
    }
  };

  const handleRetake = () => {
    setCapturedPhoto((prev) => {
      revokePreviewUrl(prev);
      return null;
    });
    setError(null);
    setCameraKey((k) => k + 1);
    setStep("camera");
    setMessage(VERIFICATION_STEP_MESSAGES.camera);
    attendanceFlowLog("Camera Started (retake)");
  };

  const handleApprove = async () => {
    attendanceFlowLog('User Click "אישור"');

    const gps = gpsRef.current;
    const device = deviceRef.current;
    const capture = capturedPhoto;

    if (!gps || !device || !capture) {
      attendanceFlowLog("error", {
        phase: "approve-precondition",
        hasGps: Boolean(gps),
        hasDevice: Boolean(device),
        hasCapture: Boolean(capture),
      });
      setError("רישום הנוכחות נכשל.\n\nנסה שוב.");
      setStep("error");
      return;
    }

    // No AI validation — proceed directly to upload
    attendanceFlowLog("Validation Skipped (no AI check)");

    setStep("uploading");
    setMessage(VERIFICATION_STEP_MESSAGES.uploading);
    attendanceFlowLog("Upload Started");

    let uploaded: PhotoUploadResult;
    const uploadPerf = cameraPerfStart("uploadVerificationPhoto");
    try {
      uploaded = await uploadVerificationPhoto(capture.blob, userId, kind);
      uploadPerf.end({ ok: true, photoPath: uploaded.photoPath });
      attendanceFlowLog("Upload Finished", { photoPath: uploaded.photoPath });
    } catch (err) {
      uploadPerf.end({ ok: false });
      fail(err, "upload");
      return;
    }

    setStep("saving");
    setMessage(VERIFICATION_STEP_MESSAGES.saving);

    try {
      const payload = buildVerificationPayload(gps, uploaded, device);
      const savePerf = cameraPerfStart("onSubmit → Attendance API");
      await onSubmit(toAttendanceMeta(payload));
      savePerf.end({ ok: true });
      attendanceFlowLog("Attendance Saved");

      setStep("done");
      setMessage(VERIFICATION_STEP_MESSAGES.done);
      setCapturedPhoto((prev) => {
        revokePreviewUrl(prev);
        return null;
      });
      setTimeout(() => {
        attendanceFlowLog("Dialog Closed (success)");
        handleClose();
      }, 1200);
    } catch (err) {
      fail(err, "saving");
    }
  };

  const title = isCheckOut ? "רישום יציאה" : "רישום כניסה";
  const showLive = step === "camera" || step === "capturing";
  const showLoader =
    LOADING_STEPS.includes(step) || (step === "camera" && !videoReady);

  return (
    <Modal open={open} onClose={handleClose} title={title} className="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
          {showLoader && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-opal-gold" />
              <p className="text-sm font-medium text-slate-700">{message}</p>
            </div>
          )}
          {step === "preview" && !error && (
            <p className="text-sm font-medium text-slate-700">{message}</p>
          )}
          {step === "camera" && videoReady && !error && (
            <p className="text-sm font-medium text-slate-700">מוכן לצילום — לחץ &quot;צלם&quot;</p>
          )}
          {step === "done" && (
            <div className="flex flex-col items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
              <p className="font-medium">הנוכחות נרשמה בהצלחה</p>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>
          )}
        </div>

        {showLive && (
          <div className="relative rounded-2xl border overflow-hidden bg-black">
            <video
              key={`cam-${cameraKey}`}
              ref={bindVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-[400px] object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {!videoReady && step === "camera" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </div>
        )}

        {step === "preview" && capturedPhoto && (
          <div className="rounded-2xl border overflow-hidden bg-black">
            <img
              src={capturedPhoto.previewUrl}
              alt="תצוגה מקדימה"
              className="w-full h-[400px] object-cover"
              onLoad={() => attendanceFlowLog("Preview Image Rendered (onLoad)")}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          {step === "camera" && (
            <Button type="button" onClick={handleCapture} disabled={!videoReady}>
              <Camera className="mr-2 h-4 w-4" />
              צלם
            </Button>
          )}
          {step === "preview" && capturedPhoto && (
            <>
              <Button type="button" variant="outline" onClick={handleRetake}>
                צילום מחדש
              </Button>
              <Button type="button" onClick={handleApprove}>
                אישור
              </Button>
            </>
          )}
          {step === "error" && (
            <Button type="button" onClick={handleRetry}>
              נסה שוב
            </Button>
          )}
          {step !== "done" && (
            <Button type="button" variant="outline" onClick={handleClose}>
              <X className="mr-2 h-4 w-4" />
              ביטול
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
