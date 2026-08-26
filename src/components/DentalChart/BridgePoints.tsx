"use client";

import { memo, useMemo } from "react";
import { UPPER_ARCH_ORDER, LOWER_ARCH_ORDER, isBridgePairActive } from "@/lib/orders/bridge-groups";
import type { ToothDefinition } from "./toothTypes";

type Pt = { x: number; y: number };

/** Midpoint of A–B, then push outward from arch curvature center (above upper / below lower). */
function bridgeControlPoint(a: Pt, b: Pt, archCenter: Pt, outwardOffset: number): Pt {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const dx = midX - archCenter.x;
  const dy = midY - archCenter.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: midX + (dx / len) * outwardOffset,
    y: midY + (dy / len) * outwardOffset,
  };
}

interface BridgePointsProps {
  teeth: ToothDefinition[];
  jaw: "upper" | "lower";
  archCenter: Pt;
  /** Distance (SVG units) from tooth-pair midpoint outward off the arch. */
  outwardOffset?: number;
  bridgeGroups: number[][];
  disabled?: boolean;
  onTogglePair: (a: number, b: number) => void;
}

export const BridgePoints = memo(function BridgePoints({
  teeth,
  jaw,
  archCenter,
  outwardOffset = 34,
  bridgeGroups,
  disabled,
  onTogglePair,
}: BridgePointsProps) {
  const byNumber = useMemo(() => {
    const map = new Map<number, ToothDefinition>();
    for (const t of teeth) map.set(t.number, t);
    return map;
  }, [teeth]);

  const arch = jaw === "upper" ? UPPER_ARCH_ORDER : LOWER_ARCH_ORDER;

  const points = useMemo(() => {
    const result: Array<{ a: number; b: number; x: number; y: number; active: boolean }> = [];
    for (let i = 0; i < arch.length - 1; i++) {
      const a = arch[i]!;
      const b = arch[i + 1]!;
      const ta = byNumber.get(a);
      const tb = byNumber.get(b);
      if (!ta || !tb) continue;
      const pos = bridgeControlPoint(
        { x: ta.cx, y: ta.cy },
        { x: tb.cx, y: tb.cy },
        archCenter,
        outwardOffset,
      );
      result.push({
        a,
        b,
        x: pos.x,
        y: pos.y,
        active: isBridgePairActive(bridgeGroups, a, b),
      });
    }
    return result;
  }, [arch, archCenter, byNumber, bridgeGroups, outwardOffset]);

  return (
    <g className="dc-bridge-points" aria-label="נקודות גשר">
      {points.map((p) => (
        <g
          key={`${p.a}-${p.b}`}
          className={[
            "dc-bridge-point",
            p.active ? "dc-bridge-point--active" : "",
            disabled ? "dc-bridge-point--disabled" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`גשר ${p.a}–${p.b}`}
          aria-pressed={p.active}
          onClick={
            disabled
              ? undefined
              : (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onTogglePair(p.a, p.b);
                }
          }
          onKeyDown={
            disabled
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onTogglePair(p.a, p.b);
                  }
                }
          }
        >
          <circle className="dc-bridge-point-hit" r={14} />
          {/* Nested so CSS scale does not wipe SVG translate */}
          <g className="dc-bridge-point-visual">
            <circle className="dc-bridge-point-ring" r={p.active ? 7.5 : 6.5} />
            <circle className="dc-bridge-point-dot" r={p.active ? 4.5 : 2.4} />
          </g>
          <title>{`גשר ${p.a}–${p.b}`}</title>
        </g>
      ))}
    </g>
  );
});
