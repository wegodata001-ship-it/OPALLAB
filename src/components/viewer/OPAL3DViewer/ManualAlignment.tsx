"use client";

import { X } from "lucide-react";

export type ManualAlignValues = {
  moveX: number;
  moveY: number;
  moveZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
};

type ManualAlignmentProps = {
  values: ManualAlignValues;
  targetLabel: string;
  onChange: (v: ManualAlignValues) => void;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
};

function Num({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-white/70">
      <span className="w-12 shrink-0 text-white/45">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md bg-white/8 border border-white/10 px-1.5 py-1 text-white text-[11px] outline-none focus:border-white/25"
      />
    </label>
  );
}

/** Compact right drawer — not a modal / large panel. */
export function ManualAlignmentPanel({
  values,
  targetLabel,
  onChange,
  onApply,
  onReset,
  onClose,
}: ManualAlignmentProps) {
  const set = (patch: Partial<ManualAlignValues>) => onChange({ ...values, ...patch });

  return (
    <aside className="absolute top-14 right-2 bottom-14 z-20 w-52 flex flex-col rounded-[18px] bg-white/5 backdrop-blur-xl border border-white/10 text-white shadow-[0_8px_28px_rgba(0,0,0,0.28)] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/8">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-white/90">Manual Alignment</p>
          <p className="text-[10px] text-white/40 truncate" title={targetLabel}>
            {targetLabel}
          </p>
        </div>
        <button
          type="button"
          className="text-white/40 hover:text-white p-0.5"
          onClick={onClose}
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2 space-y-1.5">
        <Num label="Move X" value={values.moveX} step={0.5} onChange={(n) => set({ moveX: n })} />
        <Num label="Move Y" value={values.moveY} step={0.5} onChange={(n) => set({ moveY: n })} />
        <Num label="Move Z" value={values.moveZ} step={0.5} onChange={(n) => set({ moveZ: n })} />
        <Num label="Rot X" value={values.rotX} step={1} onChange={(n) => set({ rotX: n })} />
        <Num label="Rot Y" value={values.rotY} step={1} onChange={(n) => set({ rotY: n })} />
        <Num label="Rot Z" value={values.rotZ} step={1} onChange={(n) => set({ rotZ: n })} />
        <Num label="Scale" value={values.scale} step={0.05} onChange={(n) => set({ scale: n })} />
      </div>
      <div className="flex gap-1.5 px-3 py-2 border-t border-white/8">
        <button
          type="button"
          className="flex-1 h-7 rounded-md bg-white/12 text-[11px] text-white/90 hover:bg-white/18"
          onClick={onApply}
        >
          Apply
        </button>
        <button
          type="button"
          className="flex-1 h-7 rounded-md border border-white/12 text-[11px] text-white/70 hover:bg-white/8"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </aside>
  );
}

export const DEFAULT_MANUAL_ALIGN: ManualAlignValues = {
  moveX: 0,
  moveY: 0,
  moveZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scale: 1,
};
