"use client";

import { CheckCircle2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FmUploadAggregate } from "@/lib/file-manager-v2/upload-state";

type FmGlobalProgressProps = {
  state: FmUploadAggregate;
  selectedCount?: number | null;
  className?: string;
  sticky?: boolean;
};

export function FmGlobalProgress({
  state,
  selectedCount,
  className,
  sticky = true,
}: FmGlobalProgressProps) {
  const showBar = state.isUploading || state.hasBlocking || state.isComplete;
  const showSelection = selectedCount != null && selectedCount > 0;

  if (!showBar && !showSelection) return null;

  return (
    <div
      className={cn(
        sticky && "sticky top-0 z-40",
        "mb-3 rounded-xl border bg-white shadow-sm overflow-hidden",
        state.isComplete && !state.hasBlocking && state.total > 0
          ? "border-emerald-200"
          : state.hasBlocking
            ? "border-sky-200"
            : "border-slate-200",
        className,
      )}
    >
      {showSelection && (
        <div className="flex items-center gap-2 border-b border-slate-100 bg-emerald-50/80 px-4 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="font-medium">{selectedCount} קבצים נבחרו</span>
        </div>
      )}

      {state.isUploading && (
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Upload className="h-4 w-4 text-sky-600 animate-pulse" />
              מעלה קבצים...
            </div>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {state.done + state.uploading} / {state.total}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              <strong className="text-sky-700 tabular-nums">{state.uploading}</strong>{" "}
              עובדים
            </span>
            <span>
              <strong className="text-amber-700 tabular-nums">{state.queued}</strong>{" "}
              ממתינים
            </span>
            <span>
              <strong className="text-emerald-700 tabular-nums">{state.done}</strong>{" "}
              הושלמו
            </span>
            {state.error > 0 && (
              <span>
                <strong className="text-red-600 tabular-nums">{state.error}</strong>{" "}
                נכשלו
              </span>
            )}
          </div>

          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-sky-500 to-sky-400 transition-all duration-200"
              style={{ width: `${state.overallProgress}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 tabular-nums text-left" dir="ltr">
            {state.done} / {state.total} · {state.overallProgress}%
          </p>
        </div>
      )}

      {!state.isUploading && state.isComplete && state.total > 0 && (
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {state.total} קבצים הועלו
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-700">
            {state.kindSummary.map(({ label, count }) => (
              <span key={label} className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {count} {label}
              </span>
            ))}
          </div>
          <p className="text-xs text-emerald-600 pt-0.5">
            ✔ כל הקבצים נשמרו — כעת ניתן לשמור את ההזמנה.
          </p>
        </div>
      )}

      {!state.isUploading && state.hasBlocking && state.error > 0 && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {state.error} קבצים נכשלו — לחץ «נסה שוב» על הקובץ בלבד (בלי להעלות את כל
          הרשימה מחדש).
        </div>
      )}
    </div>
  );
}

export function FmSaveUploadHint({
  state,
  hasAnyFiles,
}: {
  state: FmUploadAggregate;
  hasAnyFiles: boolean;
}) {
  if (!hasAnyFiles) return null;

  if (state.hasBlocking) {
    return (
      <p className="text-xs text-amber-700 font-medium">
        יש להמתין עד שכל הקבצים יסתיימו.
        {state.isUploading && (
          <span className="text-slate-500 font-normal">
            {" "}
            ({state.uploading} עובדים · {state.queued} ממתינים · {state.done}/
            {state.total})
          </span>
        )}
      </p>
    );
  }

  if (state.isComplete && state.total > 0) {
    return (
      <p className="text-xs text-emerald-700 font-medium">
        ✔ כל הקבצים הועלו בהצלחה — כעת ניתן לשמור.
      </p>
    );
  }

  return null;
}
