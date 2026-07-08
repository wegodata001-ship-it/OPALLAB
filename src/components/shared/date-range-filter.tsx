"use client";

import { Input, Label } from "@/components/ui/input";
import type { DateRange } from "@/lib/types";

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

export function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps) {
  const toInput = (d: Date | null) => (d ? d.toISOString().split("T")[0] : "");
  return (
    <div className={`flex flex-wrap items-end gap-3 ${className ?? ""}`}>
      <div>
        <Label className="text-xs">מתאריך</Label>
        <Input
          type="date"
          className="h-9 text-sm w-36"
          value={toInput(value.from)}
          onChange={(e) => onChange({ ...value, from: e.target.value ? new Date(e.target.value) : null })}
        />
      </div>
      <div>
        <Label className="text-xs">עד תאריך</Label>
        <Input
          type="date"
          className="h-9 text-sm w-36"
          value={toInput(value.to)}
          onChange={(e) => onChange({ ...value, to: e.target.value ? new Date(e.target.value) : null })}
        />
      </div>
      {(value.from || value.to) && (
        <button
          type="button"
          onClick={() => onChange({ from: null, to: null })}
          className="text-xs text-slate-500 hover:text-slate-700 pb-2"
        >
          נקה
        </button>
      )}
    </div>
  );
}
