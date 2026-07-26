"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  ALL_TOOTH_NUMBERS,
  LEFT_SIDE_NUMBERS,
  LOWER_JAW_NUMBERS,
  RIGHT_SIDE_NUMBERS,
  UPPER_JAW_NUMBERS,
} from "./toothData";
import type { ToothStatus } from "./toothTypes";

export function useDentalChart(
  selectedTeeth: number[],
  onChange: (teeth: number[]) => void,
  readOnly?: boolean,
  toothStatuses?: Partial<Record<number, ToothStatus>>,
) {
  const selectedSet = useMemo(() => new Set(selectedTeeth), [selectedTeeth]);
  const selectedRef = useRef(selectedTeeth);
  selectedRef.current = selectedTeeth;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const toggleTooth = useCallback(
    (number: number) => {
      if (readOnlyRef.current) return;
      const current = selectedRef.current;
      onChange(
        current.includes(number)
          ? current.filter((t) => t !== number)
          : [...current, number].sort((a, b) => a - b),
      );
    },
    [onChange],
  );

  const isSelected = useCallback((number: number) => selectedSet.has(number), [selectedSet]);

  const statusOf = useCallback(
    (number: number): ToothStatus => {
      const custom = toothStatuses?.[number];
      if (custom && custom !== "idle") return custom;
      return selectedSet.has(number) ? "selected" : "idle";
    },
    [selectedSet, toothStatuses],
  );

  const toggleGroup = useCallback(
    (teeth: number[], select: boolean) => {
      if (readOnlyRef.current) return;
      const current = selectedRef.current;
      if (select) onChange([...new Set([...current, ...teeth])].sort((a, b) => a - b));
      else onChange(current.filter((t) => !teeth.includes(t)));
    },
    [onChange],
  );

  const selectAll = useCallback(() => {
    if (!readOnlyRef.current) onChange([...ALL_TOOTH_NUMBERS].sort((a, b) => a - b));
  }, [onChange]);

  const clearAll = useCallback(() => {
    if (!readOnlyRef.current) onChange([]);
  }, [onChange]);

  const invert = useCallback(() => {
    if (readOnlyRef.current) return;
    const set = new Set(selectedRef.current);
    onChange(ALL_TOOTH_NUMBERS.filter((t) => !set.has(t)).sort((a, b) => a - b));
  }, [onChange]);

  /** Stable per-tooth click handlers — only recreate when toggleTooth identity changes */
  const toothHandlers = useMemo(() => {
    const map = new Map<number, () => void>();
    for (const n of ALL_TOOTH_NUMBERS) {
      map.set(n, () => toggleTooth(n));
    }
    return map;
  }, [toggleTooth]);

  return {
    selectedSet,
    toggleTooth,
    toothHandlers,
    isSelected,
    statusOf,
    toggleGroup,
    selectAll,
    clearAll,
    invert,
    UPPER_JAW_NUMBERS,
    LOWER_JAW_NUMBERS,
    RIGHT_SIDE_NUMBERS,
    LEFT_SIDE_NUMBERS,
  };
}
