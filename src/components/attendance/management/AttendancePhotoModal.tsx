"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAttendancePhotoUrl } from "@/lib/attendance/management/client";

export interface AttendancePhotoItem {
  url?: string | null;
  label: string;
  recordId?: string;
  kind?: "check-in" | "check-out";
}

interface AttendancePhotoModalProps {
  open: boolean;
  onClose: () => void;
  photos: AttendancePhotoItem[];
  startIndex?: number;
  /** Owner-only download */
  allowDownload?: boolean;
}

export function AttendancePhotoModal({
  open,
  onClose,
  photos,
  startIndex = 0,
  allowDownload = false,
}: AttendancePhotoModalProps) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setIndex(Math.min(startIndex, Math.max(0, photos.length - 1)));
      setZoom(1);
    }
  }, [open, startIndex, photos.length]);

  const current = photos[Math.min(index, Math.max(0, photos.length - 1))];

  useEffect(() => {
    if (!open || !current) return;

    let cancelled = false;
    setZoom(1);
    setImgLoaded(false);
    setError(null);

    async function resolve() {
      setLoading(true);
      try {
        if (current.recordId && current.kind) {
          const photo = await fetchAttendancePhotoUrl(current.recordId, current.kind);
          if (!cancelled) {
            setResolvedUrl(photo.url);
            setError(null);
          }
          return;
        }
        if (current.url?.trim()) {
          if (!cancelled) {
            setResolvedUrl(current.url);
            setError(null);
          }
          return;
        }
        if (!cancelled) {
          setResolvedUrl(null);
          setError("אין תמונה זמינה");
        }
      } catch {
        if (!cancelled) {
          if (current.url?.trim()) {
            setResolvedUrl(current.url);
            setError(null);
          } else {
            setResolvedUrl(null);
            setError("אין תמונה זמינה");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [open, index, current?.recordId, current?.kind, current?.url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && photos.length > 1) {
        setIndex((i) => (i - 1 + photos.length) % photos.length);
      }
      if (e.key === "ArrowLeft" && photos.length > 1) {
        setIndex((i) => (i + 1) % photos.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, photos.length]);

  if (!mounted || !open || photos.length === 0) return null;

  const prev = () => {
    setIndex((i) => (i - 1 + photos.length) % photos.length);
  };
  const next = () => {
    setIndex((i) => (i + 1) % photos.length);
  };

  const download = () => {
    if (!resolvedUrl || !allowDownload) return;
    const a = document.createElement("a");
    a.href = resolvedUrl;
    a.download = `attendance-${current.kind ?? "photo"}.jpg`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  };

  const openOriginal = () => {
    if (!resolvedUrl) return;
    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className={cn("relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col")}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-bold text-lg">{current.label}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100" aria-label="סגור">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-auto p-5 flex-1">
          <div className="relative min-h-[280px] rounded-xl border bg-slate-100 flex items-center justify-center p-2 overflow-auto">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-10">
                <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
              </div>
            )}
            {!loading && error && (
              <p className="text-sm text-slate-500 py-16">{error}</p>
            )}
            {!loading && !error && resolvedUrl && (
              <img
                key={resolvedUrl}
                src={resolvedUrl}
                alt={current.label}
                className={cn(
                  "max-w-full max-h-[65vh] w-auto h-auto object-contain transition-transform duration-200",
                  !imgLoaded && "opacity-0",
                )}
                style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
                referrerPolicy="no-referrer"
                onLoad={() => setImgLoaded(true)}
                onError={() => {
                  setImgLoaded(false);
                  setError("אין תמונה זמינה");
                  setResolvedUrl(null);
                }}
              />
            )}
            {!loading && !error && resolvedUrl && !imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
            <div className="flex gap-2 items-center">
              {photos.length > 1 && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={prev}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-slate-500 self-center">
                    {index + 1} / {photos.length}
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={next}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!resolvedUrl || !!error}
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                title="הקטן"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!resolvedUrl || !!error}
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                title="הגדל"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!resolvedUrl || !!error}
                onClick={() => setZoom(1)}
                title="התאם למסך"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!resolvedUrl || !!error}
                onClick={openOriginal}
                title="פתח מקור"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              {allowDownload && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!resolvedUrl || !!error}
                  onClick={download}
                  title="הורדה"
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
