"use client";

import { memo } from "react";
import { ChartDefs } from "./ChartDefs";
import { Tooth } from "./Tooth";
import { UPPER_TEETH, UPPER_VIEWBOX } from "./toothData";
import type { ToothStatus } from "./toothTypes";

interface UpperJawProps {
  selectedSet: Set<number>;
  statusOf: (number: number) => ToothStatus;
  toothHandlers: Map<number, () => void>;
  disabled?: boolean;
}

export const UpperJaw = memo(function UpperJaw({
  selectedSet,
  statusOf,
  toothHandlers,
  disabled,
}: UpperJawProps) {
  return (
    <svg className="dc-svg" viewBox={UPPER_VIEWBOX} role="img" aria-label="לסת עליונה">
      <ChartDefs />
      <g id="upper-jaw">
        {UPPER_TEETH.map((tooth) => (
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
