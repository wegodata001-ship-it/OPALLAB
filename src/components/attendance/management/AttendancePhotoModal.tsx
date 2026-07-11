"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AttendancePhotoItem {
  url: string;
  label: string;
}

interface AttendancePhotoModalProps {
  open: boolean;
  onClose: () => void;
  photos: AttendancePhotoItem[];
  startIndex?: number;
}

export function AttendancePhotoModal({ open, onClose, photos, startIndex = 0 }: AttendancePhotoModalProps) {
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setIndex(Math.min(startIndex, Math.max(0, photos.length - 1)));
      setZoom(1);
    }
  }, [open, startIndex, photos.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open || photos.length === 0) return null;

  const current = photos[Math.min(index, photos.length - 1)];

  const prev = () => {
    setIndex((i) => (i - 1 + photos.length) % photos.length);
    setZoom(1);
  };
  const next = () => {
    setIndex((i) => (i + 1) % photos.length);
    setZoom(1);
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
          <div className="min-h-[200px] rounded-xl border bg-slate-900 flex items-center justify-center p-2">
            <img
              src={current.url}
              alt={current.label}
              className="max-w-full max-h-[65vh] w-auto h-auto object-contain transition-transform duration-200"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex items-center justify-between gap-2 mt-4">
            <div className="flex gap-2">
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
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
