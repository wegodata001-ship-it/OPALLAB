"use client";

import { memo } from "react";
import { ChartDefs } from "./ChartDefs";
import { Tooth } from "./Tooth";
import { LOWER_TEETH, LOWER_VIEWBOX } from "./toothData";
import type { ToothStatus } from "./toothTypes";

interface LowerJawProps {
  selectedSet: Set<number>;
  statusOf: (number: number) => ToothStatus;
  toothHandlers: Map<number, () => void>;
  disabled?: boolean;
}

export const LowerJaw = memo(function LowerJaw({
  selectedSet,
  statusOf,
  toothHandlers,
  disabled,
}: LowerJawProps) {
  return (
    <svg className="dc-svg" viewBox={LOWER_VIEWBOX} role="img" aria-label="לסת תחתונה">
      <ChartDefs />
      <g id="lower-jaw">
        {LOWER_TEETH.map((tooth) => (
          <Tooth
            key={tooth.number}
            number={tooth.number}
            kind={tooth.kind}
            cx={tooth.cx}
            cy={tooth.cy}
            rotation={tooth.rotation}
            selected={selectedSet.has(tooth.number)}
            status={statusOf(tooth.number)}
            disabled={!!disabled}
            onClick={toothHandlers.get(tooth.number)!}
          />
        ))}
      </g>
    </svg>
  );
});
