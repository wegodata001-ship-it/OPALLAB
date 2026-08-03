"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { LAB_INFO } from "@/lib/constants/labels";
import { OFFICIAL_ATTENDANCE_CHECKIN_URL } from "@/lib/attendance/gate/checkin-url";
import { Copy, Download, Printer } from "lucide-react";

/** Large QR + actions for the official attendance check-in URL. */
export function AttendanceQrPanel({
  className,
  showUrl = false,
}: {
  className?: string;
  /** Hide raw URL on daily ops screens (copy button still available). */
  showUrl?: boolean;
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const url = OFFICIAL_ATTENDANCE_CHECKIN_URL;

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((d) => {
      if (!cancelled) setDataUrl(d);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("העתיקו את הקישור:", url);
    }
  };

  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "opal-lab-attendance-qr.png";
    a.click();
  };

  const openPrintable = () => {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>QR נוכחות — ${LAB_INFO.name}</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: Arial, sans-serif; text-align: center; color: #0f172a; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { font-size: 13px; color: #475569; margin: 6px 0; }
    img { width: 360px; height: 360px; margin: 20px auto; display: block; }
    .url { font-size: 12px; word-break: break-all; direction: ltr; margin-top: 16px; }
    .hint { margin-top: 24px; font-size: 12px; text-align: right; max-width: 420px; margin-inline: auto; }
  </style>
</head>
<body>
  <h1>${LAB_INFO.name}</h1>
  <p>שער נוכחות — QR קבוע לכניסה / יציאה</p>
  <img src="${dataUrl}" alt="QR Attendance" />
    <p class="url">${url}</p>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    w.document.close();
  };

  return (
    <div className={className}>
      <div className="flex flex-col items-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="QR לנוכחות OPAL LAB"
            className="w-72 h-72 sm:w-80 sm:h-80 rounded-2xl border-2 border-slate-200 bg-white shadow-sm"
          />
        ) : (
          <div className="w-72 h-72 sm:w-80 sm:h-80 rounded-2xl bg-slate-100 animate-pulse" />
        )}
        {showUrl && (
          <p className="mt-4 text-sm font-medium text-slate-800 break-all text-center" dir="ltr">
            {url}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
        <Button type="button" variant="outline" onClick={() => void copyLink()}>
          <Copy className="h-4 w-4 ml-1" />
          {copied ? "הועתק ✓" : "העתק קישור"}
        </Button>
        <Button type="button" variant="outline" onClick={downloadPng} disabled={!dataUrl}>
          <Download className="h-4 w-4 ml-1" />
          PNG
        </Button>
        <Button type="button" variant="outline" onClick={openPrintable} disabled={!dataUrl}>
          <Download className="h-4 w-4 ml-1" />
          PDF
        </Button>
        <Button type="button" variant="outline" onClick={openPrintable} disabled={!dataUrl}>
          <Printer className="h-4 w-4 ml-1" />
          הדפסה
        </Button>
      </div>
    </div>
  );
}
