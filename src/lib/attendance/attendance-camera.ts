export async function requestCameraStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("מצלמה אינה זמינה בדפדפן זה");
  }

  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}

export function stopMediaStream(stream?: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

export async function captureStillFromVideo(video: HTMLVideoElement, maxWidth = 1280): Promise<{ dataUrl: string; blob: Blob }> {
  const canvas = document.createElement("canvas");
  const videoWidth = video.videoWidth || 640;
  const videoHeight = video.videoHeight || 480;
  const scale = Math.min(1, maxWidth / videoWidth);

  canvas.width = Math.max(1, Math.floor(videoWidth * scale));
  canvas.height = Math.max(1, Math.floor(videoHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("לא ניתן ליצור תמונה מהמצלמה");
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("לא ניתן לאחסן את התמונה"));
        return;
      }
      resolve(value);
    }, "image/jpeg", 0.8);
  });

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.8),
    blob,
  };
}
