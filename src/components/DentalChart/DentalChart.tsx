"use client";

import { cn } from "@/lib/utils";
import { LowerJaw } from "./LowerJaw";
import { UpperJaw } from "./UpperJaw";
import { useDentalChart } from "./useDentalChart";
import type { DentalChartProps } from "./toothTypes";
import "./styles.css";

/** Lab-only status legend — not shown on order creation. */
const LAB_STATUS_LEGEND = [
  { label: "בריאה", color: "bg-white border-[#CFCFCF]" },
  { label: "נבחרה", color: "bg-[#7C3AED] border-violet-800" },
  { label: "בטיפול", color: "bg-amber-200 border-amber-600" },
  { label: "הושלם", color: "bg-green-300 border-green-700" },
  { label: "בעיה", color: "bg-red-300 border-red-700" },
] as const;

export function DentalChart({
  selectedTeeth,
  onChange,
  readOnly,
  className,
  toothStatuses,
  showStatusLegend = false,
}: DentalChartProps) {
  const {
    selectedSet,
    statusOf,
    toothHandlers,
    toggleGroup,
    selectAll,
    clearAll,
    invert,
    UPPER_JAW_NUMBERS,
    LOWER_JAW_NUMBERS,
    RIGHT_SIDE_NUMBERS,
    LEFT_SIDE_NUMBERS,
  } = useDentalChart(selectedTeeth, onChange, readOnly, toothStatuses);

  const showAside = showStatusLegend || !readOnly;

  return (
    <div className={cn("dc-root rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-widest text-slate-400">מבנה שיניים · FDI</p>
        {!readOnly && (
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["בחר הכל", selectAll],
                ["נקה בחירה", clearAll],
                ["הפוך בחירה", invert],
              ] as const
            ).map(([label, fn]) => (
              <button
                key={label}
                type="button"
                onClick={fn}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={cn("flex flex-col gap-4", showAside && "lg:flex-row")}>
        <div className="min-w-0 flex-1 space-y-1">
          <div>
            <p className="mb-0.5 text-center text-[10px] font-semibold text-slate-400">
              לסת עליונה · 18–11 | 21–28
            </p>
            <UpperJaw
              selectedSet={selectedSet}
              statusOf={statusOf}
              toothHandlers={toothHandlers}
              disabled={readOnly}
            />
          </div>

          <div className="flex items-center gap-2 px-2">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] text-slate-400">קו אמצע · 11 | 21</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div>
            <p className="mb-0.5 text-center text-[10px] font-semibold text-slate-400">
              לסת תחתונה · 48–41 | 31–38
            </p>
            <LowerJaw
              selectedSet={selectedSet}
              statusOf={statusOf}
              toothHandlers={toothHandlers}
              disabled={readOnly}
            />
          </div>
        </div>

        {showAside && (
          <aside className="flex shrink-0 flex-col gap-4 border-t border-dashed border-slate-200 pt-3 lg:w-44 lg:border-r lg:border-t-0 lg:pr-3 lg:pt-0">
            {showStatusLegend && (
              <div>
                <p className="mb-2 text-[10px] font-semibold tracking-wide text-slate-400">מקרא סטטוסים</p>
                <ul className="space-y-1.5">
                  {LAB_STATUS_LEGEND.map((item) => (
                    <li key={item.label} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className={cn("h-3.5 w-3.5 rounded-sm border shadow-sm", item.color)} />
                      {item.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!readOnly && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold tracking-wide text-slate-400">בחירה מהירה</p>
                {(
                  [
                    ["בחר כל הלסת העליונה", UPPER_JAW_NUMBERS],
                    ["בחר כל הלסת התחתונה", LOWER_JAW_NUMBERS],
                    ["בחר צד ימין", RIGHT_SIDE_NUMBERS],
                    ["בחר צד שמאל", LEFT_SIDE_NUMBERS],
                  ] as const
                ).map(([label, teeth]) => {
                  const all = teeth.every((t) => selectedSet.has(t));
                  return (
                    <label key={label} className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={all}
                        onChange={() => toggleGroup([...teeth], !all)}
                        className="h-3.5 w-3.5 accent-[#7C3AED]"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            )}
          </aside>
        )}
      </div>

      {selectedTeeth.length > 0 && (
        <div className="mt-3 text-center">
          <span className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-800">
            {selectedTeeth.length} שיניים: {selectedTeeth.join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}
