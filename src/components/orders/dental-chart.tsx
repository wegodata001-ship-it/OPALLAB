"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** FDI — chart left = patient's right */
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];
const LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];

/** Left → right on screen (patient right → patient left) */
const UPPER_ARCH = [...UPPER_RIGHT, ...UPPER_LEFT]; // 18…11 | 21…28
const LOWER_ARCH = [...[...LOWER_RIGHT].reverse(), ...[...LOWER_LEFT].reverse()]; // 48…41 | 31…38

const ALL_TEETH = [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_RIGHT, ...LOWER_LEFT];
const UPPER_JAW = [...UPPER_RIGHT, ...UPPER_LEFT];
const LOWER_JAW = [...LOWER_RIGHT, ...LOWER_LEFT];
const RIGHT_SIDE = [...UPPER_RIGHT, ...LOWER_RIGHT];
const LEFT_SIDE = [...UPPER_LEFT, ...LOWER_LEFT];

interface DentalChartProps {
  selectedTeeth: number[];
  onChange: (teeth: number[]) => void;
  readOnly?: boolean;
  className?: string;
}

interface ToothPose {
  tooth: number;
  x: number;
  y: number;
  rotate: number;
}

type ToothKind = "central" | "lateral" | "canine" | "premolar" | "molar";

function toothKind(fdi: number): ToothKind {
  const p = fdi % 10;
  if (p === 1) return "central";
  if (p === 2) return "lateral";
  if (p === 3) return "canine";
  if (p === 4 || p === 5) return "premolar";
  return "molar";
}

/** Occlusal-view size — matches clinic form proportions */
function toothSize(fdi: number): { w: number; h: number } {
  switch (toothKind(fdi)) {
    case "molar":
      return { w: 30, h: 34 };
    case "premolar":
      return { w: 25, h: 28 };
    case "canine":
      return { w: 23, h: 28 };
    case "lateral":
      return { w: 20, h: 28 };
    case "central":
    default:
      return { w: 22, h: 30 };
  }
}

/**
 * Polar layout — equal angular step.
 * A mild fan follows the curve while keeping every tooth easy to read.
 */
function layoutArch(
  teeth: number[],
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): ToothPose[] {
  const n = teeth.length;
  if (!n) return [];
  const step = n === 1 ? 0 : (endAngle - startAngle) / (n - 1);
  const midAngle = (startAngle + endAngle) / 2;

  return teeth.map((tooth, i) => {
    const angle = startAngle + i * step;
    return {
      tooth,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      // The central teeth are upright. Outer teeth only fan out slightly.
      rotate: ((angle - midAngle) * 180) / Math.PI * 0.45,
    };
  });
}

/** Anatomical occlusal silhouette (viewBox 0 0 40 48, center ~20,24) */
function ToothShape({
  fdi,
  selected,
}: {
  fdi: number;
  selected: boolean;
}) {
  const kind = toothKind(fdi);
  const fill = selected ? "#d4a84b" : "#f8fafc";
  const stroke = selected ? "#8b6914" : "#94a3b8";
  const detail = selected ? "#fff8e7" : "#cbd5e1";

  if (kind === "molar") {
    return (
      <>
        <rect x="3" y="4" width="34" height="40" rx="6" fill={fill} stroke={stroke} strokeWidth="1.6" />
        <path d="M11 17h18M11 30h18M20 10v28M9 24h22" fill="none" stroke={detail} strokeWidth="1.1" />
      </>
    );
  }
  if (kind === "premolar") {
    return (
      <>
        <ellipse cx="20" cy="24" rx="14" ry="18" fill={fill} stroke={stroke} strokeWidth="1.6" />
        <path d="M20 10v28M12 24h16" fill="none" stroke={detail} strokeWidth="1.15" />
      </>
    );
  }
  if (kind === "canine") {
    return (
      <path
        d="M20 4 L32 18 L28 42 L12 42 L8 18 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    );
  }
  // incisors — narrow rectangle with rounded ends
  const rw = kind === "central" ? 11 : 9;
  return (
    <rect
      x={20 - rw}
      y="6"
      width={rw * 2}
      height="36"
      rx="4"
      fill={fill}
      stroke={stroke}
      strokeWidth="1.6"
    />
  );
}

const ToothMark = memo(function ToothMark({
  pose,
  selected,
  onClick,
  readOnly,
}: {
  pose: ToothPose;
  selected: boolean;
  onClick: () => void;
  readOnly?: boolean;
}) {
  const { w, h } = toothSize(pose.tooth);
  const sx = w / 40;
  const sy = h / 48;

  return (
    <g
      transform={`translate(${pose.x} ${pose.y}) rotate(${pose.rotate}) scale(${sx} ${sy}) translate(-20 -24)`}
      className={cn(!readOnly && "cursor-pointer", readOnly && "cursor-default")}
      style={{ transition: "opacity 150ms" }}
      onClick={readOnly ? undefined : onClick}
      role="button"
      tabIndex={readOnly ? -1 : 0}
      aria-pressed={selected}
      aria-label={`שן ${pose.tooth}`}
      onKeyDown={
        readOnly
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
      }
    >
      <title>{`שן ${pose.tooth}`}</title>
      {/* Hit area */}
      <rect x="0" y="0" width="40" height="48" fill="transparent" />
      <ToothShape fdi={pose.tooth} selected={selected} />
      {/* Number always upright */}
      <g transform={`rotate(${-pose.rotate} 20 24)`}>
        <text
          x="20"
          y="25"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={selected ? "#ffffff" : "#1e293b"}
          fontSize={12 / Math.min(sx, sy)}
          fontWeight={700}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {pose.tooth}
        </text>
      </g>
    </g>
  );
});

/**
 * Clinic-form arches:
 * Upper ∩ — centrals 11|21 at BOTTOM (facing lower) · center ABOVE
 * Lower ∪ — centrals 41|31 at TOP (facing upper) · center BELOW
 */
const ArchCanvas = memo(function ArchCanvas({
  teeth,
  kind,
  selectedSet,
  toggle,
  readOnly,
  width,
}: {
  teeth: number[];
  kind: "upper" | "lower";
  selectedSet: Set<number>;
  toggle: (n: number) => void;
  readOnly?: boolean;
  width: number;
}) {
  // Wider polar span: compact U-shape with less unused vertical space.
  const SPAN = (145 * Math.PI) / 180;
  const half = SPAN / 2;
  // A fixed maximum drawing area avoids stretching the arch across wide cards.
  const chartWidth = Math.min(width, 480);
  const chartOffsetX = (width - chartWidth) / 2;
  const padX = 20;
  const usable = Math.max(220, chartWidth - padX * 2);

  // Chord width = 2 r sin(half) ⇒ r fills the card
  const radius = usable / (2 * Math.sin(half));

  const toothPad = 30;
  // The central incisors sit a full radius from the circle center.
  // Reserving that full depth prevents the centre teeth from being clipped.
  const height = toothPad * 2 + radius;

  const cx = chartOffsetX + chartWidth / 2;

  // Upper: center above → bottom arc (π/2) → centrals lowest (near midline)
  // Lower: center below → top arc (3π/2) → centrals highest (near midline)
  const cy = kind === "upper" ? toothPad : height - toothPad;

  const mid = kind === "upper" ? Math.PI / 2 : (3 * Math.PI) / 2;
  const startAngle = kind === "upper" ? mid + half : mid - half;
  const endAngle = kind === "upper" ? mid - half : mid + half;

  const poses = useMemo(
    () => layoutArch(teeth, cx, cy, radius, startAngle, endAngle),
    [teeth, cx, cy, radius, startAngle, endAngle],
  );

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={kind === "upper" ? "קשת עליונה" : "קשת תחתונה"}
      >
        {/* Thin clinical guide behind the teeth */}
        <path
          d={arcPath(cx, cy, radius, startAngle, endAngle)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1"
          strokeDasharray="2 5"
          opacity={0.6}
        />

        {/* Vertical midline */}
        <line
          x1={cx}
          y1={kind === "upper" ? cy + radius * 0.35 : cy - radius * 0.35}
          x2={cx}
          y2={kind === "upper" ? cy + radius + 6 : cy - radius - 6}
          stroke="#94a3b8"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity={0.35}
        />

        {poses.map((pose) => (
          <ToothMark
            key={pose.tooth}
            pose={pose}
            selected={selectedSet.has(pose.tooth)}
            onClick={() => toggle(pose.tooth)}
            readOnly={readOnly}
          />
        ))}
      </svg>
    </div>
  );
});

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const delta = a1 - a0;
  const large = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta < 0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

const LEGEND = [
  { label: "בריא", color: "bg-white border-slate-300" },
  { label: "בטיפול", color: "bg-opal-gold/30 border-opal-gold" },
  { label: "חסר", color: "bg-slate-200 border-slate-400" },
  { label: "שתל", color: "bg-sky-100 border-sky-400" },
  { label: "כתר", color: "bg-amber-100 border-amber-500" },
  { label: "גשר", color: "bg-violet-100 border-violet-400" },
] as const;

function SideControls({
  selectedTeeth,
  onToggleGroup,
  readOnly,
}: {
  selectedTeeth: number[];
  onToggleGroup: (teeth: number[], select: boolean) => void;
  readOnly?: boolean;
}) {
  const groups = [
    { label: "בחר כל הלסת העליונה", teeth: UPPER_JAW },
    { label: "בחר כל הלסת התחתונה", teeth: LOWER_JAW },
    { label: "בחר צד ימין", teeth: RIGHT_SIDE },
    { label: "בחר צד שמאל", teeth: LEFT_SIDE },
  ] as const;

  return (
    <div className={cn("space-y-2", readOnly && "pointer-events-none opacity-60")}>
      {groups.map((g) => {
        const allSelected = g.teeth.every((t) => selectedTeeth.includes(t));
        return (
          <label
            key={g.label}
            className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-600"
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onToggleGroup(g.teeth, !allSelected)}
              className="h-3.5 w-3.5 accent-opal-gold"
            />
            <span>{g.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function useContainerWidth(min = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? min;
      setWidth(Math.max(min, Math.floor(w)));
    });
    ro.observe(el);
    setWidth(Math.max(min, Math.floor(el.clientWidth || min)));
    return () => ro.disconnect();
  }, [min]);

  return { ref, width };
}

export function DentalChart({ selectedTeeth, onChange, readOnly, className }: DentalChartProps) {
  const selectedSet = useMemo(() => new Set(selectedTeeth), [selectedTeeth]);
  const { ref, width } = useContainerWidth(280);

  const toggle = useCallback(
    (tooth: number) => {
      if (readOnly) return;
      onChange(
        selectedTeeth.includes(tooth)
          ? selectedTeeth.filter((t) => t !== tooth)
          : [...selectedTeeth, tooth].sort((a, b) => a - b),
      );
    },
    [onChange, readOnly, selectedTeeth],
  );

  const toggleGroup = useCallback(
    (teeth: number[], select: boolean) => {
      if (readOnly) return;
      if (select) {
        onChange([...new Set([...selectedTeeth, ...teeth])].sort((a, b) => a - b));
      } else {
        onChange(selectedTeeth.filter((t) => !teeth.includes(t)));
      }
    },
    [onChange, readOnly, selectedTeeth],
  );

  const selectAll = useCallback(() => {
    if (readOnly) return;
    onChange([...ALL_TEETH].sort((a, b) => a - b));
  }, [onChange, readOnly]);

  const clearAll = useCallback(() => {
    if (readOnly) return;
    onChange([]);
  }, [onChange, readOnly]);

  const invert = useCallback(() => {
    if (readOnly) return;
    const set = new Set(selectedTeeth);
    onChange(ALL_TEETH.filter((t) => !set.has(t)).sort((a, b) => a - b));
  }, [onChange, readOnly, selectedTeeth]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors duration-150 hover:border-opal-gold/40 hover:bg-opal-gold/5"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 xl:flex-row">
        <div ref={ref} className="min-w-0 flex-1">
          {/* Quadrant labels — RTL: first = visual right */}
          <div className="mb-0 flex justify-between px-1 text-[10px] font-semibold text-slate-400">
            <span>עליון ימין · 18–11</span>
            <span>עליון שמאל · 21–28</span>
          </div>

          <ArchCanvas
            teeth={UPPER_ARCH}
            kind="upper"
            selectedSet={selectedSet}
            toggle={toggle}
            readOnly={readOnly}
            width={width}
          />

          <div className="flex items-center gap-2 py-0.5">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="shrink-0 text-[10px] text-slate-400">קו אמצע · 11 | 21</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <ArchCanvas
            teeth={LOWER_ARCH}
            kind="lower"
            selectedSet={selectedSet}
            toggle={toggle}
            readOnly={readOnly}
            width={width}
          />

          <div className="mt-0 flex justify-between px-1 text-[10px] font-semibold text-slate-400">
            <span>תחתון ימין · 48–41</span>
            <span>תחתון שמאל · 31–38</span>
          </div>
        </div>

        <aside className="flex shrink-0 flex-col gap-4 border-t border-dashed border-slate-200 pt-3 xl:w-40 xl:border-r xl:border-t-0 xl:pr-3 xl:pt-0">
          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-wide text-slate-400">מקרא</p>
            <ul className="space-y-1.5">
              {LEGEND.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className={cn("h-3.5 w-3.5 rounded-sm border shadow-sm", item.color)} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
          {!readOnly && (
            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-wide text-slate-400">בחירה מהירה</p>
              <SideControls
                selectedTeeth={selectedTeeth}
                onToggleGroup={toggleGroup}
                readOnly={readOnly}
              />
            </div>
          )}
        </aside>
      </div>

      {selectedTeeth.length > 0 && (
        <div className="mt-3 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-opal-gold/20 bg-opal-gold/10 px-4 py-1.5 text-sm font-medium text-opal-gold-dark">
            {selectedTeeth.length} שיניים: {selectedTeeth.join(" · ")}
          </span>
        </div>
      )}
    </div>
  );
}
