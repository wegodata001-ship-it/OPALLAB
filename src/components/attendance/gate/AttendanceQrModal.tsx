"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { LAB_INFO } from "@/lib/constants/labels";
import { OFFICIAL_ATTENDANCE_CHECKIN_URL } from "@/lib/attendance/gate/checkin-url";
import { Copy, Download, Printer, X, Nfc } from "lucide-react";

interface AttendanceQrModalProps {
  open: boolean;
  onClose: () => void;
}

export function AttendanceQrModal({ open, onClose }: AttendanceQrModalProps) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const url = OFFICIAL_ATTENDANCE_CHECKIN_URL;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((d) => {
      if (!cancelled) setDataUrl(d);
    });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  if (!open) return null;

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

  const downloadPdf = () => {
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
    img { width: 320px; height: 320px; margin: 20px auto; display: block; }
    .url { font-size: 12px; word-break: break-all; direction: ltr; margin-top: 16px; }
    .hint { margin-top: 24px; font-size: 12px; text-align: right; max-width: 420px; margin-inline: auto; }
  </style>
</head>
<body>
  <h1>${LAB_INFO.name}</h1>
  <p>שער נוכחות — QR קבוע לכניסה / יציאה</p>
  <img src="${dataUrl}" alt="QR Attendance" />
  <p class="url">${url}</p>
  <div class="hint">
    <strong>NFC:</strong> כתבו את אותו קישור לתג NFC (NDEF URI / URL).
    העובד מצמיד את הטלפון — נפתח אותו דף בדיוק כמו בסריקת QR.
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    w.document.close();
  };

  const printQr = () => downloadPdf();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="font-bold text-slate-900">QR לנוכחות</p>
            <p className="text-xs text-slate-500">קישור קבוע להדפסה / NFC</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex justify-center">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                alt="QR לנוכחות"
                className="w-64 h-64 rounded-xl border border-slate-200 bg-white"
              />
            ) : (
              <div className="w-64 h-64 rounded-xl bg-slate-100 animate-pulse" />
            )}
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[11px] text-slate-400 mb-1">קישור רשמי</p>
            <p className="text-sm font-medium text-slate-800 break-all" dir="ltr">
              {url}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => void copyLink()}>
              <Copy className="h-4 w-4 ml-1" />
              {copied ? "הועתק ✓" : "העתק קישור"}
            </Button>
            <Button type="button" variant="outline" onClick={printQr}>
              <Printer className="h-4 w-4 ml-1" />
              הדפסה
            </Button>
            <Button type="button" variant="outline" onClick={downloadPng} disabled={!dataUrl}>
              <Download className="h-4 w-4 ml-1" />
              הורד PNG
            </Button>
            <Button type="button" variant="outline" onClick={downloadPdf} disabled={!dataUrl}>
              <Download className="h-4 w-4 ml-1" />
              הורד PDF
            </Button>
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-sm text-slate-700 space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5 text-sky-900">
              <Nfc className="h-4 w-4" />
              כתיבה לתג NFC
            </p>
            <ol className="list-decimal pr-5 text-xs text-slate-600 space-y-1">
              <li>פתחו אפליקציית כתיבת NFC (NFC Tools וכד׳).</li>
              <li>בחרו רשומת URL / URI.</li>
              <li>הדביקו את הקישור הרשמי למעלה.</li>
              <li>הצמידו את התג וכתבו — אותו קישור כמו ב־QR.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
