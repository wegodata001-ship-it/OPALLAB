import { AttendanceVerificationError } from "@/lib/attendance/verification/types";
import type { PhotoCaptureResult } from "@/lib/attendance/verification/types";
import { cameraPerfCheck, cameraPerfMark, cameraPerfStart } from "@/lib/attendance/verification/camera-debug";

export function isVideoReadyForCapture(video: HTMLVideoElement): boolean {
  return (
    video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 12000): Promise<void> {
  if (isVideoReadyForCapture(video)) return;

  await new Promise<void>((resolve, reject) => {
    const events = ["loadedmetadata", "loadeddata", "canplay", "canplaythrough"] as const;
    let settled = false;

    const cleanup = () => {
      events.forEach((e) => video.removeEventListener(e, onReady));
      window.clearTimeout(timer);
    };

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      ok ? resolve() : reject(new Error("המצלמה לא מוכנה לצילום"));
    };

    const onReady = () => {
      if (isVideoReadyForCapture(video)) finish(true);
    };

    events.forEach((e) => video.addEventListener(e, onReady));
    const timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

export async function requestFrontCameraStream(): Promise<MediaStream> {
  const perf = cameraPerfStart("Camera Request (getUserMedia)");
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    perf.end({ ok: false, reason: "no mediaDevices" });
    throw new AttendanceVerificationError("לא ניתן לפתוח מצלמה בדפדפן זה", "camera");
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const tracks = stream.getVideoTracks();
    perf.end({
      ok: true,
      trackCount: stream.getTracks().length,
      videoTrackLabel: tracks[0]?.label,
      videoSettings: tracks[0]?.getSettings?.(),
    });
    cameraPerfMark("MediaStream Ready", {
      trackCount: stream.getTracks().length,
      videoSettings: tracks[0]?.getSettings?.(),
    });
    return stream;
  } catch (err) {
    perf.end({ ok: false, reason: String(err) });
    throw new AttendanceVerificationError("לא ניתן לפתוח מצלמה. יש לאשר הרשאת מצלמה.", "camera");
  }
}

export function stopCameraStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  const perf = cameraPerfStart("attachStreamToVideo");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  const playPerf = cameraPerfStart("video.play()");
  await video.play();
  playPerf.end();

  const waitPerf = cameraPerfStart("waitForVideoReady");
  await waitForVideoReady(video);
  waitPerf.end({
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    readyState: video.readyState,
  });

  perf.end({
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    readyState: video.readyState,
  });
  cameraPerfMark("Video Ready", {
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    readyState: video.readyState,
    paused: video.paused,
    streamActive: stream.active,
  });
}

export async function capturePhotoFromVideo(video: HTMLVideoElement): Promise<PhotoCaptureResult> {
  const totalPerf = cameraPerfStart("capturePhotoFromVideo (total)");

  if (!isVideoReadyForCapture(video)) {
    totalPerf.end({ ok: false, reason: "video not ready" });
    throw new AttendanceVerificationError("המצלמה לא מוכנה לצילום", "capturing");
  }

  const scale = Math.min(1, 1280 / video.videoWidth);
  const canvasW = Math.max(1, Math.floor(video.videoWidth * scale));
  const canvasH = Math.max(1, Math.floor(video.videoHeight * scale));

  cameraPerfCheck("pre-capture state", {
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    canvasWidth: canvasW,
    canvasHeight: canvasH,
    scale,
    videoPaused: video.paused,
    videoReadyState: video.readyState,
    srcObjectActive: video.srcObject instanceof MediaStream ? (video.srcObject as MediaStream).active : null,
    usesResize: scale < 1,
  });

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    totalPerf.end({ ok: false, reason: "no canvas context" });
    throw new AttendanceVerificationError("יצירת התמונה נכשלה", "capturing");
  }

  const pausePerf = cameraPerfStart("video.pause()");
  video.pause();
  pausePerf.end({ videoPaused: video.paused, streamStillAttached: Boolean(video.srcObject) });

  const drawPerf = cameraPerfStart("drawImage()");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  drawPerf.end({ canvasWidth: canvas.width, canvasHeight: canvas.height });

  const blobPerf = cameraPerfStart("canvas.toBlob()");
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("blob=null"))),
      "image/jpeg",
      0.85,
    );
  });
  blobPerf.end({
    blobSizeBytes: blob.size,
    blobSizeKB: Math.round(blob.size / 1024),
    blobType: blob.type,
  });
  cameraPerfMark("Blob Ready", {
    blobSizeBytes: blob.size,
    blobSizeKB: Math.round(blob.size / 1024),
  });

  const urlPerf = cameraPerfStart("URL.createObjectURL(blob) [preview]");
  const previewUrl = URL.createObjectURL(blob);
  urlPerf.end({
    previewUrlPrefix: previewUrl.slice(0, 32),
    previewIsObjectUrl: true,
    previewIsBase64: false,
  });

  cameraPerfCheck("capture output", {
    blobSizeBytes: blob.size,
    previewUsesObjectUrl: true,
    encodeOnce: "toBlob only — no toDataURL",
  });

  totalPerf.end({ ok: true });
  return { blob, previewUrl };
}

export function releaseCamera(video: HTMLVideoElement | null, stream: MediaStream | null): void {
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  stopCameraStream(stream);
}
