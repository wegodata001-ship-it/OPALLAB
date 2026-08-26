"use client";

import { memo, useMemo } from "react";
import { BridgeArcs } from "./BridgeArcs";
import { BridgePoints } from "./BridgePoints";
import { ChartDefs } from "./ChartDefs";
import { Tooth } from "./Tooth";
import { LOWER_TEETH, LOWER_VIEWBOX } from "./toothData";
import type { ToothInteraction } from "./useDentalChart";
import type { ToothStatus } from "./toothTypes";

const LOWER_ARCH_CENTER = { x: 240, y: -20 };

interface LowerJawProps {
  selectedSet: Set<number>;
  statusOf: (number: number) => ToothStatus;
  toothInteractions: Map<number, ToothInteraction>;
  endpointSet: Set<number>;
  flashTeeth: Set<number>;
  bridgeGroups?: number[][];
  disabled?: boolean;
  onToggleBridgePair?: (a: number, b: number) => void;
}

export const LowerJaw = memo(function LowerJaw({
  selectedSet,
  statusOf,
  toothInteractions,
  endpointSet,
  flashTeeth,
  bridgeGroups = [],
  disabled,
  onToggleBridgePair,
}: LowerJawProps) {
  const lowerGroups = useMemo(() => {
    const lowerNums = new Set(LOWER_TEETH.map((t) => t.number));
    const groups = Array.isArray(bridgeGroups) ? bridgeGroups : [];
    return groups.filter(
      (g): g is number[] => Array.isArray(g) && g.some((n) => lowerNums.has(Number(n))),
    );
  }, [bridgeGroups]);

  return (
    <svg
      className="dc-svg"
      viewBox={LOWER_VIEWBOX}
      role="img"
      aria-label="לסת תחתונה"
      style={{ touchAction: disabled ? undefined : "none" }}
    >
      <ChartDefs />
      <BridgeArcs
        bridgeGroups={lowerGroups}
        teeth={LOWER_TEETH}
        archCenter={LOWER_ARCH_CENTER}
      />
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
            rangeEndpoint={endpointSet.has(tooth.number)}
            rangeFlash={flashTeeth.has(tooth.number)}
            interaction={toothInteractions.get(tooth.number)!}
          />
        ))}
      </g>
      <BridgePoints
        teeth={LOWER_TEETH}
        jaw="lower"
        archCenter={LOWER_ARCH_CENTER}
        bridgeGroups={lowerGroups}
        disabled={disabled}
        onTogglePair={onToggleBridgePair ?? (() => {})}
      />
    </svg>
  );
});
