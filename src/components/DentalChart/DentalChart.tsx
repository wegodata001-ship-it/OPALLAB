"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatBridgeLabel,
  isBridgePairActive,
  parseBridgeGroups,
  pruneBridgeGroups,
  toggleBridgePair,
} from "@/lib/orders/bridge-groups";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
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

function sortTeeth(teeth: number[]): number[] {
  return [...teeth].sort((a, b) => a - b);
}

export function DentalChart({
  selectedTeeth,
  onChange,
  bridgeGroups: bridgeGroupsProp,
  onBridgeGroupsChange,
  readOnly,
  className,
  toothStatuses,
  showStatusLegend = false,
}: DentalChartProps) {
  const [bridgeGroups, setBridgeGroups] = useState<number[][]>(() =>
    parseBridgeGroups(bridgeGroupsProp),
  );

  useEffect(() => {
    if (bridgeGroupsProp !== undefined) {
      setBridgeGroups(parseBridgeGroups(bridgeGroupsProp));
    }
  }, [bridgeGroupsProp]);

  const commitBridges = useCallback(
    (next: number[][]) => {
      const normalized = parseBridgeGroups(next);
      setBridgeGroups(normalized);
      onBridgeGroupsChange?.(normalized);
    },
    [onBridgeGroupsChange],
  );

  const handleTeethChange = useCallback(
    (teeth: number[]) => {
      const pruned = pruneBridgeGroups(bridgeGroups, teeth);
      if (pruned.length !== bridgeGroups.length) {
        commitBridges(pruned);
      }
      onChange(teeth);
    },
    [bridgeGroups, commitBridges, onChange],
  );

  const {
    selectedSet,
    statusOf,
    toothInteractions,
    toggleGroup,
    selectAll,
    clearAll,
    invert,
    endpointSet,
    flashTeeth,
    mobileAnchor,
    pendingRange,
    confirmPendingRange,
    cancelPendingRange,
    UPPER_JAW_NUMBERS,
    LOWER_JAW_NUMBERS,
    RIGHT_SIDE_NUMBERS,
    LEFT_SIDE_NUMBERS,
  } = useDentalChart(selectedTeeth, handleTeethChange, readOnly, toothStatuses);

  const handleToggleBridgePair = useCallback(
    (a: number, b: number) => {
      if (readOnly) return;
      const wasActive = isBridgePairActive(bridgeGroups, a, b);
      const next = toggleBridgePair(bridgeGroups, a, b);
      commitBridges(next);
      if (!wasActive && isBridgePairActive(next, a, b)) {
        const merged = sortTeeth([...new Set([...selectedTeeth, a, b])]);
        if (merged.length !== selectedTeeth.length) onChange(merged);
      }
    },
    [bridgeGroups, commitBridges, onChange, readOnly, selectedTeeth],
  );

  const handleClearAll = useCallback(() => {
    clearAll();
    commitBridges([]);
  }, [clearAll, commitBridges]);

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
                ["נקה בחירה", handleClearAll],
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

      {!readOnly && (
        <p className="mb-2 text-center text-[10px] text-slate-400">
          לחיצה על שן לבחירה · כפתור זהב מחוץ לקשת לגשר · Shift + קליק לטווח · במובייל: לחיצה ארוכה ואז שן יעד
        </p>
      )}

      {mobileAnchor != null && !pendingRange && !readOnly && (
        <p className="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-center text-xs font-medium text-sky-800">
          נבחרה שן {mobileAnchor} כהתחלה — לחצו על שן יעד לטווח
        </p>
      )}

      <div className={cn("flex flex-col gap-4", showAside && "lg:flex-row")}>
        <div className="min-w-0 flex-1 space-y-1">
          <div>
            <p className="mb-0.5 text-center text-[10px] font-semibold text-slate-400">
              לסת עליונה · 18–11 | 21–28
            </p>
            <UpperJaw
              selectedSet={selectedSet}
              statusOf={statusOf}
              toothInteractions={toothInteractions}
              endpointSet={endpointSet}
              flashTeeth={flashTeeth}
              bridgeGroups={bridgeGroups}
              disabled={readOnly}
              onToggleBridgePair={handleToggleBridgePair}
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
              toothInteractions={toothInteractions}
              endpointSet={endpointSet}
              flashTeeth={flashTeeth}
              bridgeGroups={bridgeGroups}
              disabled={readOnly}
              onToggleBridgePair={handleToggleBridgePair}
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
        <div className="mt-3 flex flex-col items-center gap-1.5 text-center">
          <span className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-800">
            {selectedTeeth.length} שיניים: {selectedTeeth.join(" · ")}
          </span>
          {bridgeGroups.length > 0 && (
            <span className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-violet-300/80 bg-white px-3 py-1 text-xs font-medium text-violet-700">
              גשר: {bridgeGroups.map(formatBridgeLabel).join(" · ")}
            </span>
          )}
        </div>
      )}

      <Modal
        open={!!pendingRange}
        onClose={cancelPendingRange}
        title="בחירת טווח"
        className="max-w-sm"
      >
        {pendingRange && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-700">
              לבחור את כל הטווח בין {pendingRange.start} ל־{pendingRange.end}?
            </p>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {pendingRange.teeth.join(" · ")}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={cancelPendingRange}>
                לא
              </Button>
              <Button type="button" onClick={confirmPendingRange}>
                כן
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
