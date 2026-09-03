"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AttendanceManagementRecord } from "@/lib/attendance/management/types";
import {
  formatMinutesHHmm,
  getAttendanceStatus,
  statusBadgeClassName,
  type AttendanceStatusResult,
} from "@/lib/attendance/management/attendance-status";
import { formatTime, cn } from "@/lib/utils";

function StatusPopover({
  status,
  record,
  anchorRef,
  open,
  onClose,
}: {
  status: AttendanceStatusResult;
  record: Pick<AttendanceManagementRecord, "checkIn" | "checkOut">;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open || !popoverRef.current || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const pop = popoverRef.current;
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left;

    const popWidth = pop.offsetWidth;
    const popHeight = pop.offsetHeight;

    if (left + popWidth > window.innerWidth - margin) {
      left = window.innerWidth - popWidth - margin;
    }
    if (left < margin) left = margin;

    if (top + popHeight > window.innerHeight - margin) {
      top = rect.top - popHeight - margin;
    }
    if (top < margin) top = margin;

    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }, [open, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-labelledby={titleId}
      className="fixed z-[70] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl text-right"
      style={{ top: 0, left: 0 }}
    >
      <p id={titleId} className="text-sm font-bold text-slate-900 mb-2">
        פירוט סטטוס
      </p>
      <p className="text-sm font-semibold text-slate-800 mb-3">{status.label}</p>

      {status.level === "missing_checkout" ? (
        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex justify-between gap-3">
            <span>כניסה:</span>
            <span className="font-mono font-semibold text-slate-900" dir="ltr">
              {formatTime(record.checkIn)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>יציאה:</span>
            <span className="font-semibold text-amber-700">לא נרשמה</span>
          </div>
          <p className="pt-1 text-slate-500">{status.reasons[0]?.text}</p>
          {status.lateMinutes != null && status.lateMinutes > 0 && (
            <p>• איחור של {formatMinutesHHmm(status.lateMinutes)}.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-xs text-slate-600">
          <div className="flex justify-between gap-3">
            <span>שעות עבודה:</span>
            <span className="font-mono font-semibold text-slate-900" dir="ltr">
              {formatMinutesHHmm(status.workedMinutes)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>מינימום נדרש:</span>
            <span className="font-mono font-semibold text-slate-900" dir="ltr">
              {formatMinutesHHmm(status.minimumMinutes)}
            </span>
          </div>
          {status.missingMinutes != null && status.missingMinutes > 0 && (
            <div className="flex justify-between gap-3">
              <span>חסר:</span>
              <span className="font-mono font-semibold text-amber-700" dir="ltr">
                {formatMinutesHHmm(status.missingMinutes)}
              </span>
            </div>
          )}
          {status.lateMinutes != null && status.lateMinutes > 0 && (
            <>
              <div className="flex justify-between gap-3 pt-1 border-t border-slate-100">
                <span>שעת כניסה:</span>
                <span className="font-mono font-semibold" dir="ltr">
                  {formatTime(record.checkIn)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>שעה מתוכננת:</span>
                <span className="font-mono font-semibold" dir="ltr">
                  {status.expectedStartTime}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>איחור:</span>
                <span className="font-mono font-semibold text-orange-700" dir="ltr">
                  {formatMinutesHHmm(status.lateMinutes)}
                </span>
              </div>
            </>
          )}
          {status.earlyExitMinutes != null && status.earlyExitMinutes > 0 && record.checkOut && (
            <>
              <div className="flex justify-between gap-3 pt-1 border-t border-slate-100">
                <span>שעת יציאה בפועל:</span>
                <span className="font-mono font-semibold" dir="ltr">
                  {formatTime(record.checkOut)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>שעת יציאה מתוכננת:</span>
                <span className="font-mono font-semibold" dir="ltr">
                  {status.expectedExitTime}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>הפרש:</span>
                <span className="font-mono font-semibold text-orange-700" dir="ltr">
                  {formatMinutesHHmm(status.earlyExitMinutes)}
                </span>
              </div>
            </>
          )}
          {status.reasons.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <p className="font-semibold text-slate-700">סיבות:</p>
              <ul className="space-y-1 list-none">
                {status.reasons.map((r) => (
                  <li key={r.id}>• {r.text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AttendanceStatusBadge({
  record,
  className,
  onClickStopPropagation,
}: {
  record: AttendanceManagementRecord;
  className?: string;
  onClickStopPropagation?: boolean;
}) {
  const status = getAttendanceStatus(record);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          if (onClickStopPropagation) e.stopPropagation();
          toggle();
        }}
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset cursor-pointer",
          "hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-opal-gold/60",
          statusBadgeClassName(status.level),
          className,
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {status.label}
      </button>
      <StatusPopover
        status={status}
        record={record}
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function attendanceStatusLabel(record: AttendanceManagementRecord): string {
  return getAttendanceStatus(record).label;
}
