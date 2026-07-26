import { memo } from "react";
import type { ToothKind } from "./toothTypes";

/**
 * Reference-style occlusal crowns (local space, center 0,0).
 * ~25% larger than prior set — 4 shapes only, cloned across the arch.
 */
const SHAPES: Record<
  ToothKind,
  { body: string; shade: string; depth: string; anatomy: string }
> = {
  /** Spade / trapezoid — narrow mesiodistally, taller labiolingually */
  incisor: {
    body:
      "M-7.2 -16.5 C-8.6 -16.5 -9.4 -14.8 -9.4 -12.6 L-9.8 10.2 C-9.8 13.4 -7.8 16.2 -4.6 16.4 L4.6 16.4 C7.8 16.2 9.8 13.4 9.8 10.2 L9.4 -12.6 C9.4 -14.8 8.6 -16.5 7.2 -16.5 Z",
    shade:
      "M-4.2 -12.8 C-1.6 -14.6 2 -14.6 4.4 -12.4 C3.4 -4.2 2.6 3.2 1.6 10.2 C0.4 10.4 -0.8 10.2 -2 9 C-3.4 3.2 -4 -4.2 -4.2 -12.8 Z",
    depth:
      "M-7.6 8.4 C-5.4 12.8 -2.4 14.6 0 14.8 C2.4 14.6 5.4 12.8 7.6 8.4 C5.2 10.8 2.6 12 0 12 C-2.6 12 -5.2 10.8 -7.6 8.4 Z",
    anatomy: "M0 -11.5 L0 12.2 M-3.2 -6.5 Q0 -8.2 3.2 -6.5",
  },

  /** Pointed diamond — canine */
  canine: {
    body:
      "M0 -18.8 C5.6 -17.6 8.8 -11.2 8.6 -3.6 L8.2 9.4 C7.8 13.8 4.6 17.2 0 17.8 C-4.6 17.2 -7.8 13.8 -8.2 9.4 L-8.6 -3.6 C-8.8 -11.2 -5.6 -17.6 0 -18.8 Z",
    shade:
      "M-2.4 -13.6 C0 -15.8 2.6 -14.4 3.8 -8.8 C3.2 -1.6 2.4 5.2 1.2 11.4 C0.2 11.6 -0.8 11.2 -1.8 9.8 C-2.8 -0.8 -2.8 -7.6 -2.4 -13.6 Z",
    depth:
      "M-6.4 7.2 C-4.2 12.2 -1.8 14.8 0 15.2 C1.8 14.8 4.2 12.2 6.4 7.2 C4.2 10 2 11.4 0 11.4 C-2 11.4 -4.2 10 -6.4 7.2 Z",
    anatomy: "M0 -13.2 L0 13.6 M-3.6 -4.8 Q0 -7 3.6 -4.8",
  },

  /** Rounded bicuspid — two cusp lobes + central groove */
  premolar: {
    body:
      "M-12.4 -13.2 C-14.8 -8.8 -15.2 -1.6 -13.4 5.6 C-11.2 12.2 -5.6 15.4 0 15.4 C5.6 15.4 11.2 12.2 13.4 5.6 C15.2 -1.6 14.8 -8.8 12.4 -13.2 C9.2 -17.4 3.4 -18.2 0 -18.2 C-3.4 -18.2 -9.2 -17.4 -12.4 -13.2 Z",
    shade:
      "M-6.8 -12 C-2.4 -14.6 3.2 -14.4 7 -10.8 C5.6 -3.2 4.4 3.6 2.4 9.6 C0.4 9.2 -1.8 8 -4 5.2 C-5.8 -0.4 -6.6 -6 -6.8 -12 Z",
    depth:
      "M-10.8 4.4 C-7.4 10.2 -3.4 12.8 0 13 C3.4 12.8 7.4 10.2 10.8 4.4 C7.4 7.8 3.8 9.6 0 9.6 C-3.8 9.6 -7.4 7.8 -10.8 4.4 Z",
    anatomy: "M-7.6 0 Q0 -3.6 7.6 0 M0 -11 L0 10.6 M-4.8 -5.2 a2.8 3.2 0 1 0 0.02 0 M4.8 -5.2 a2.8 3.2 0 1 0 0.02 0",
  },

  /** Bulky four-cusp molar */
  molar: {
    body:
      "M-16.4 -14.6 C-19.6 -8.4 -20 2.2 -16.8 9.6 C-13.2 16.2 -6.2 18.4 0 18.4 C6.2 18.4 13.2 16.2 16.8 9.6 C20 2.2 19.6 -8.4 16.4 -14.6 C12.4 -19.2 5.2 -19.8 0 -19.8 C-5.2 -19.8 -12.4 -19.2 -16.4 -14.6 Z",
    shade:
      "M-9.2 -13.2 C-3.2 -16 4 -15.6 9.4 -11.8 C7.8 -3.6 6.2 4 3.4 10.4 C0.8 9.8 -2.2 8 -5.2 4.2 C-7.8 -1.6 -8.8 -7.4 -9.2 -13.2 Z",
    depth:
      "M-13.8 5.6 C-9.6 12.2 -4.4 15.2 0 15.4 C4.4 15.2 9.6 12.2 13.8 5.6 C9.6 9.4 4.8 11.4 0 11.4 C-4.8 11.4 -9.6 9.4 -13.8 5.6 Z",
    anatomy:
      "M-10.4 0 Q0 -4 10.4 0 M0 -12.4 L0 12.6 M-8.2 -7.4 L8.2 7.8 M8.2 -7.4 L-8.2 7.8 M-6.2 -6.4 a3 3.2 0 1 0 0.02 0 M6.2 -6.4 a3 3.2 0 1 0 0.02 0 M-6.2 5.2 a3 3.2 0 1 0 0.02 0 M6.2 5.2 a3 3.2 0 1 0 0.02 0",
  },
};

interface ToothShapeProps {
  kind: ToothKind;
  gradientId: string;
}

export const ToothShape = memo(function ToothShape({ kind, gradientId }: ToothShapeProps) {
  const s = SHAPES[kind];

  return (
    <g className="dc-tooth-shape-group">
      <path className="dc-tooth-body" d={s.body} fill={`url(#${gradientId})`} />
      <path className="dc-tooth-depth" d={s.depth} />
      <path className="dc-tooth-shade" d={s.shade} />
      <path className="dc-tooth-anatomy" d={s.anatomy} fill="none" />
    </g>
  );
});
