"use client";

import { memo, useMemo } from "react";
import { BridgeArcs } from "./BridgeArcs";
import { BridgePoints } from "./BridgePoints";
import { ChartDefs } from "./ChartDefs";
import { Tooth } from "./Tooth";
import { UPPER_TEETH, UPPER_VIEWBOX } from "./toothData";
import type { ToothInteraction } from "./useDentalChart";
import type { ToothStatus } from "./toothTypes";

const UPPER_ARCH_CENTER = { x: 240, y: 340 };

interface UpperJawProps {
  selectedSet: Set<number>;
  statusOf: (number: number) => ToothStatus;
  toothInteractions: Map<number, ToothInteraction>;
  endpointSet: Set<number>;
  flashTeeth: Set<number>;
  bridgeGroups?: number[][];
  disabled?: boolean;
  onToggleBridgePair?: (a: number, b: number) => void;
}

export const UpperJaw = memo(function UpperJaw({
  selectedSet,
  statusOf,
  toothInteractions,
  endpointSet,
  flashTeeth,
  bridgeGroups = [],
  disabled,
  onToggleBridgePair,
}: UpperJawProps) {
  const upperGroups = useMemo(() => {
    const upperNums = new Set(UPPER_TEETH.map((t) => t.number));
    const groups = Array.isArray(bridgeGroups) ? bridgeGroups : [];
    return groups.filter(
      (g): g is number[] => Array.isArray(g) && g.some((n) => upperNums.has(Number(n))),
    );
  }, [bridgeGroups]);

  return (
    <svg
      className="dc-svg"
      viewBox={UPPER_VIEWBOX}
      role="img"
      aria-label="לסת עליונה"
      style={{ touchAction: disabled ? undefined : "none" }}
    >
      <ChartDefs />
      <BridgeArcs
        bridgeGroups={upperGroups}
        teeth={UPPER_TEETH}
        archCenter={UPPER_ARCH_CENTER}
      />
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
            rangeEndpoint={endpointSet.has(tooth.number)}
            rangeFlash={flashTeeth.has(tooth.number)}
            interaction={toothInteractions.get(tooth.number)!}
          />
        ))}
      </g>
      <BridgePoints
        teeth={UPPER_TEETH}
        jaw="upper"
        archCenter={UPPER_ARCH_CENTER}
        bridgeGroups={upperGroups}
        disabled={disabled}
        onTogglePair={onToggleBridgePair ?? (() => {})}
      />
    </svg>
  );
});
