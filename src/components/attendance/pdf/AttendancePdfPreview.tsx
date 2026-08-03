"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Download,
  Loader2,
  Printer,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type AttendancePdfPreviewProps = {
  open: boolean;
  title?: string;
  /** API URL that returns application/pdf */
  url: string | null;
  onClose: () => void;
};

export function AttendancePdfPreview({
  open,
  title = "תצוגה מקדימה – דוח נוכחות",
  url,
  onClose,
}: AttendancePdfPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [filename, setFilename] = useState("attendance.pdf");

  useEffect(() => {
    if (!open || !url) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    const run = async () => {
      setLoading(true);
      setError(null);
      setBlobUrl(null);
      setZoom(1);
      try {
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok) {
          let message = "יצירת ה-PDF נכשלה";
          try {
            const json = (await res.json()) as { error?: { message?: string } };
            if (json.error?.message) message = json.error.message;
          } catch {
            /* ignore */
          }
          throw new Error(message);
        }
        if (!contentType.includes("application/pdf")) {
          throw new Error("השרת לא החזיר קובץ PDF תקין");
        }
        const disposition = res.headers.get("content-disposition") ?? "";
        const match = /filename="([^"]+)"/i.exec(disposition);
        if (match?.[1]) setFilename(match[1]);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "שגיאה בטעינת ה-PDF");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const download = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
  };

  const print = () => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative flex h-[min(92vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!blobUrl}
              onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}
              title="הקטן"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-xs text-slate-500">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!blobUrl}
              onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
              title="הגדל"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!blobUrl} onClick={print}>
              <Printer className="h-4 w-4 ml-1" />
              הדפסה
            </Button>
            <Button type="button" size="sm" disabled={!blobUrl} onClick={download}>
              <Download className="h-4 w-4 ml-1" />
              הורדה
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="סגירה">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto bg-slate-100">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
              <Loader2 className="h-8 w-8 animate-spin text-opal-gold" />
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          {blobUrl && !error && (
            <div
              className="origin-top-center mx-auto min-h-full transition-transform"
              style={{
                transform: `scale(${zoom})`,
                width: `${100 / zoom}%`,
                height: `${100 / zoom}%`,
              }}
            >
              <iframe
                ref={iframeRef}
                title={title}
                src={blobUrl}
                className="h-full min-h-[70vh] w-full border-0 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
