"use client";

import { memo, useMemo } from "react";
import type { ToothDefinition } from "./toothTypes";

type Pt = { x: number; y: number };

function outwardPoint(tooth: ToothDefinition, center: Pt, offset: number): Pt {
  const dx = tooth.cx - center.x;
  const dy = tooth.cy - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: tooth.cx + (dx / len) * offset,
    y: tooth.cy + (dy / len) * offset,
  };
}

/** Smooth open path through points (midpoint quadratic chain). */
function smoothPath(points: Pt[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    const [a, b] = points;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i]!;
    const next = points[i + 1]!;
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    d += ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/** Short inward tick at each bridge end (bracket cap). */
function endCap(outer: Pt, tooth: ToothDefinition, length = 7): string {
  const dx = tooth.cx - outer.x;
  const dy = tooth.cy - outer.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = outer.x + (dx / len) * length;
  const ty = outer.y + (dy / len) * length;
  return `M ${outer.x.toFixed(1)} ${outer.y.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`;
}

interface BridgeArcsProps {
  bridgeGroups: number[][];
  teeth: ToothDefinition[];
  /** Approximate arch curvature center (for outward offset). */
  archCenter: Pt;
  offset?: number;
}

export const BridgeArcs = memo(function BridgeArcs({
  bridgeGroups,
  teeth,
  archCenter,
  offset = 26,
}: BridgeArcsProps) {
  const byNumber = useMemo(() => {
    const map = new Map<number, ToothDefinition>();
    for (const t of teeth) map.set(t.number, t);
    return map;
  }, [teeth]);

  const arcs = useMemo(() => {
    const result: { key: string; path: string; caps: string }[] = [];
    for (const group of bridgeGroups) {
      const defs = group
        .map((n) => byNumber.get(n))
        .filter((t): t is ToothDefinition => !!t);
      if (defs.length < 2) continue;

      const outer = defs.map((t) => outwardPoint(t, archCenter, offset));
      result.push({
        key: group.join("-"),
        path: smoothPath(outer),
        caps: `${endCap(outer[0]!, defs[0]!)} ${endCap(outer[outer.length - 1]!, defs[defs.length - 1]!)}`,
      });
    }
    return result;
  }, [bridgeGroups, byNumber, archCenter, offset]);

  if (!arcs.length) return null;

  return (
    <g className="dc-bridges" aria-hidden>
      {arcs.map((arc) => (
        <g key={arc.key}>
          <path className="dc-bridge" d={arc.path} />
          <path className="dc-bridge-cap" d={arc.caps} />
        </g>
      ))}
    </g>
  );
});
