"use client";

import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  message?: string;
  fullscreen?: boolean;
  className?: string;
}

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-10 w-10 animate-spin rounded-full border-4 border-opal-gold border-t-transparent",
        className,
      )}
      role="status"
      aria-label="טוען"
    />
  );
}

export function LoadingOverlay({ message = "טוען נתונים...", fullscreen, className }: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] z-[100]",
        fullscreen ? "fixed inset-0" : "absolute inset-0 rounded-[inherit]",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 shadow-xl border border-slate-100">
        <LoadingSpinner />
        <p className="text-sm font-medium text-slate-700">{message}</p>
      </div>
    </div>
  );
}
