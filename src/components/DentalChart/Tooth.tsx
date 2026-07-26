"use client";

import { memo, useCallback, type KeyboardEvent } from "react";
import { ToothShape } from "./ToothShape";
import type { ToothProps, ToothStatus } from "./toothTypes";

function statusClass(status: ToothStatus, selected: boolean): string {
  if (status === "completed") return "dc-tooth--completed";
  if (status === "processing") return "dc-tooth--processing";
  if (status === "problem") return "dc-tooth--problem";
  if (selected || status === "selected") return "dc-tooth--selected";
  return "";
}

function ToothComponent({
  number,
  kind,
  cx,
  cy,
  rotation,
  selected,
  status,
  disabled,
  onClick,
}: ToothProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<SVGGElement>) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
    [disabled, onClick],
  );

  const visualSelected = selected || status === "selected";
  const gradientId = visualSelected ? "dc-selected" : "dc-fill";

  return (
    <g id={`tooth-${number}`} transform={`translate(${cx} ${cy}) rotate(${rotation})`}>
      <g
        className={[
          "dc-tooth",
          !disabled ? "dc-tooth--interactive" : "dc-tooth--disabled",
          statusClass(status, selected),
        ]
          .filter(Boolean)
          .join(" ")}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Tooth ${number}`}
        aria-pressed={visualSelected}
        aria-disabled={disabled || undefined}
        data-tooth={number}
        data-kind={kind}
        onClick={disabled ? undefined : onClick}
        onKeyDown={handleKeyDown}
      >
        <title>{`Tooth ${number}`}</title>
        <ToothShape kind={kind} gradientId={gradientId} />
        <g transform={`rotate(${-rotation})`}>
          <text
            className="dc-tooth-number"
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {number}
          </text>
        </g>
      </g>
    </g>
  );
}

function propsEqual(a: ToothProps, b: ToothProps) {
  return (
    a.number === b.number &&
    a.kind === b.kind &&
    a.cx === b.cx &&
    a.cy === b.cy &&
    a.rotation === b.rotation &&
    a.selected === b.selected &&
    a.status === b.status &&
    a.disabled === b.disabled &&
    a.onClick === b.onClick
  );
}

export const Tooth = memo(ToothComponent, propsEqual);
