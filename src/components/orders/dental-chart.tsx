"use client";

import { cn } from "@/lib/utils";

/** FDI chart styled like the physical OPAL LAB order form */
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
const LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];

interface DentalChartProps {
  selectedTeeth: number[];
  onChange: (teeth: number[]) => void;
  readOnly?: boolean;
  className?: string;
}

function Tooth({
  num,
  selected,
  onClick,
  readOnly,
  side,
}: {
  num: number;
  selected: boolean;
  onClick: () => void;
  readOnly?: boolean;
  side: "ur" | "ul" | "ll" | "lr";
}) {
  const isMolar = [16, 17, 18, 26, 27, 28, 36, 37, 38, 46, 47, 48].includes(num);
  const isPremolar = [14, 15, 24, 25, 34, 35, 44, 45].includes(num);
  const w = isMolar ? 36 : isPremolar ? 30 : 24;
  const h = isMolar ? 42 : isPremolar ? 38 : 34;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={readOnly}
      title={`שן ${num}`}
      className={cn(
        "relative flex flex-col items-center transition-all group",
        !readOnly && "cursor-pointer",
        readOnly && "cursor-default"
      )}
    >
      <svg width={w} height={h} viewBox="0 0 40 48" className="drop-shadow-sm">
        <path
          d={
            isMolar
              ? "M4 8 Q20 0 36 8 L38 36 Q20 48 2 36 Z"
              : isPremolar
              ? "M8 6 Q20 2 32 6 L34 34 Q20 44 6 34 Z"
              : "M12 4 Q20 0 28 4 L30 32 Q20 42 10 32 Z"
          }
          className={cn(
            "transition-all stroke-[1.5]",
            selected
              ? "fill-opal-gold stroke-opal-gold-dark"
              : "fill-white stroke-slate-300 group-hover:stroke-opal-gold/60 group-hover:fill-opal-gold/10"
          )}
        />
        {selected && (
          <path d="M14 22 L18 28 L28 16" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        )}
      </svg>
      <span
        className={cn(
          "text-[11px] font-bold mt-0.5",
          selected ? "text-opal-gold-dark" : "text-slate-500"
        )}
      >
        {num}
      </span>
    </button>
  );
}

function ArchRow({
  teeth,
  side,
  selectedTeeth,
  toggle,
  readOnly,
  reverse,
}: {
  teeth: number[];
  side: "ur" | "ul" | "ll" | "lr";
  selectedTeeth: number[];
  toggle: (n: number) => void;
  readOnly?: boolean;
  reverse?: boolean;
}) {
  const list = reverse ? [...teeth].reverse() : teeth;
  return (
    <div className="flex items-end gap-0.5">
      {list.map((num) => (
        <Tooth
          key={num}
          num={num}
          selected={selectedTeeth.includes(num)}
          onClick={() => toggle(num)}
          readOnly={readOnly}
          side={side}
        />
      ))}
    </div>
  );
}

export function DentalChart({ selectedTeeth, onChange, readOnly, className }: DentalChartProps) {
  const toggle = (tooth: number) => {
    if (readOnly) return;
    onChange(
      selectedTeeth.includes(tooth)
        ? selectedTeeth.filter((t) => t !== tooth)
        : [...selectedTeeth, tooth].sort((a, b) => a - b)
    );
  };

  return (
    <div className={cn("rounded-2xl border-2 border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6", className)}>
      <p className="text-center text-xs font-semibold text-slate-400 tracking-widest mb-4">מבנה שיניים · FDI</p>

      {/* Upper arch */}
      <div className="flex justify-center items-end gap-1 mb-1">
        <ArchRow teeth={UPPER_RIGHT} side="ur" selectedTeeth={selectedTeeth} toggle={toggle} readOnly={readOnly} reverse />
        <div className="w-3 h-16 border-r-2 border-dashed border-slate-300 mx-1" />
        <ArchRow teeth={UPPER_LEFT} side="ul" selectedTeeth={selectedTeeth} toggle={toggle} readOnly={readOnly} />
      </div>

      {/* Midline */}
      <div className="flex items-center gap-2 my-3">
        <div className="flex-1 border-t border-dashed border-slate-300" />
        <span className="text-[10px] text-slate-400 px-2">קו אמצע</span>
        <div className="flex-1 border-t border-dashed border-slate-300" />
      </div>

      {/* Lower arch */}
      <div className="flex justify-center items-start gap-1 mt-1">
        <ArchRow teeth={LOWER_RIGHT} side="lr" selectedTeeth={selectedTeeth} toggle={toggle} readOnly={readOnly} reverse />
        <div className="w-3 h-16 border-r-2 border-dashed border-slate-300 mx-1" />
        <ArchRow teeth={LOWER_LEFT} side="ll" selectedTeeth={selectedTeeth} toggle={toggle} readOnly={readOnly} />
      </div>

      {selectedTeeth.length > 0 && (
        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-opal-gold/10 px-4 py-1.5 text-sm font-medium text-opal-gold-dark">
            {selectedTeeth.length} שיניים: {selectedTeeth.join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}
