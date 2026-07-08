"use client";

import type { OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABELS, WORKFLOW_STEPS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface WorkflowTrackerProps {
  currentStatus: OrderStatus;
  compact?: boolean;
}

export function WorkflowTracker({ currentStatus, compact }: WorkflowTrackerProps) {
  const currentIndex = WORKFLOW_STEPS.indexOf(currentStatus);
  const isCancelled = currentStatus === "CANCELLED";

  if (isCancelled) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center text-red-700 font-medium">
        הזמנה בוטלה
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {WORKFLOW_STEPS.map((step, i) => (
          <div key={step} className="flex items-center">
            <div
              className={cn(
                "h-2 w-8 rounded-full",
                i <= currentIndex ? "bg-opal-gold" : "bg-slate-200"
              )}
            />
            {i < WORKFLOW_STEPS.length - 1 && <div className="w-1" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-0">
        {WORKFLOW_STEPS.map((step, i) => {
          const isComplete = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={step} className="flex items-center">
              <div className="flex flex-col items-center w-20">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                    isComplete && "border-opal-gold bg-opal-gold text-white",
                    isCurrent && "border-opal-gold bg-opal-gold/10 text-opal-gold-dark ring-4 ring-opal-gold/20",
                    !isComplete && !isCurrent && "border-slate-200 bg-white text-slate-400"
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "mt-1.5 text-[10px] text-center leading-tight",
                    isCurrent ? "font-semibold text-opal-gold-dark" : "text-slate-500"
                  )}
                >
                  {ORDER_STATUS_LABELS[step]}
                </span>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-6 -mt-5",
                    i < currentIndex ? "bg-opal-gold" : "bg-slate-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
