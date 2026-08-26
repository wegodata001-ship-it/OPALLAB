"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ALL_TOOTH_NUMBERS,
  LEFT_SIDE_NUMBERS,
  LOWER_JAW_NUMBERS,
  RIGHT_SIDE_NUMBERS,
  UPPER_JAW_NUMBERS,
} from "./toothData";
import { getArchRange } from "./tooth-range";
import type { ToothStatus } from "./toothTypes";

const LONG_PRESS_MS = 520;
const DRAG_THRESHOLD_PX = 6;
const FLASH_MS = 450;
const ENDPOINT_MS = 700;

export type ToothInteraction = {
  onClick: (e: ReactMouseEvent) => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerEnter: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: () => void;
};

export type PendingRangeConfirm = {
  start: number;
  end: number;
  teeth: number[];
};

function sortTeeth(teeth: number[]): number[] {
  return [...teeth].sort((a, b) => a - b);
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

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

  const anchorRef = useRef<number | null>(null);
  const [mobileAnchor, setMobileAnchor] = useState<number | null>(null);
  const [pendingRange, setPendingRange] = useState<PendingRangeConfirm | null>(null);
  const [rangeEndpoints, setRangeEndpoints] = useState<Set<number>>(new Set());
  const [flashTeeth, setFlashTeeth] = useState<Set<number>>(new Set());

  const dragRef = useRef<{
    active: boolean;
    started: boolean;
    mode: "add" | "remove";
    originX: number;
    originY: number;
    visited: Set<number>;
    pointerId: number;
  } | null>(null);

  const longPressRef = useRef<{
    tooth: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const skipClickRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endpointTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (longPressRef.current) clearTimeout(longPressRef.current.timer);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (endpointTimerRef.current) clearTimeout(endpointTimerRef.current);
    };
  }, []);

  const showRangeVisual = useCallback((start: number, end: number, teeth: number[]) => {
    setRangeEndpoints(new Set([start, end]));
    setFlashTeeth(new Set(teeth));
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    if (endpointTimerRef.current) clearTimeout(endpointTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashTeeth(new Set()), FLASH_MS);
    endpointTimerRef.current = setTimeout(() => setRangeEndpoints(new Set()), ENDPOINT_MS);
  }, []);

  const applyRange = useCallback(
    (start: number, end: number) => {
      if (readOnlyRef.current) return;
      const range = getArchRange(start, end);
      if (!range?.length) return;

      const current = selectedRef.current;
      const allSelected = range.every((t) => current.includes(t));
      onChange(
        allSelected
          ? current.filter((t) => !range.includes(t))
          : sortTeeth([...new Set([...current, ...range])]),
      );
      showRangeVisual(start, end, range);
      anchorRef.current = end;
    },
    [onChange, showRangeVisual],
  );

  const toggleTooth = useCallback(
    (number: number) => {
      if (readOnlyRef.current) return;
      const current = selectedRef.current;
      onChange(
        current.includes(number)
          ? current.filter((t) => t !== number)
          : sortTeeth([...current, number]),
      );
      anchorRef.current = number;
    },
    [onChange],
  );

  const paintTooth = useCallback(
    (number: number, mode: "add" | "remove") => {
      if (readOnlyRef.current) return;
      const current = selectedRef.current;
      const has = current.includes(number);
      if (mode === "add" && !has) onChange(sortTeeth([...current, number]));
      if (mode === "remove" && has) onChange(current.filter((t) => t !== number));
    },
    [onChange],
  );

  const clearLongPress = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }, []);

  const handleActivate = useCallback(
    (number: number, opts: { shiftKey: boolean }) => {
      if (readOnlyRef.current) return;

      // Mobile: second tap after long-press → confirm range
      if (mobileAnchor != null && isCoarsePointer()) {
        if (mobileAnchor === number) {
          setMobileAnchor(null);
          setRangeEndpoints(new Set());
          toggleTooth(number);
          return;
        }
        const range = getArchRange(mobileAnchor, number);
        if (range) {
          setPendingRange({ start: mobileAnchor, end: number, teeth: range });
          setRangeEndpoints(new Set([mobileAnchor, number]));
          return;
        }
        setMobileAnchor(null);
        setRangeEndpoints(new Set());
      }

      if (opts.shiftKey && anchorRef.current != null) {
        applyRange(anchorRef.current, number);
        return;
      }

      toggleTooth(number);
    },
    [applyRange, mobileAnchor, toggleTooth],
  );

  const confirmPendingRange = useCallback(() => {
    if (!pendingRange) return;
    applyRange(pendingRange.start, pendingRange.end);
    setPendingRange(null);
    setMobileAnchor(null);
  }, [applyRange, pendingRange]);

  const cancelPendingRange = useCallback(() => {
    setPendingRange(null);
    setRangeEndpoints(new Set());
    setMobileAnchor(null);
  }, []);

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
      if (select) onChange(sortTeeth([...new Set([...current, ...teeth])]));
      else onChange(current.filter((t) => !teeth.includes(t)));
    },
    [onChange],
  );

  const selectAll = useCallback(() => {
    if (!readOnlyRef.current) onChange(sortTeeth([...ALL_TOOTH_NUMBERS]));
  }, [onChange]);

  const clearAll = useCallback(() => {
    if (!readOnlyRef.current) onChange([]);
  }, [onChange]);

  const invert = useCallback(() => {
    if (readOnlyRef.current) return;
    const set = new Set(selectedRef.current);
    onChange(ALL_TOOTH_NUMBERS.filter((t) => !set.has(t)));
  }, [onChange]);

  const toothInteractions = useMemo(() => {
    const map = new Map<number, ToothInteraction>();

    for (const n of ALL_TOOTH_NUMBERS) {
      map.set(n, {
        onClick: (e) => {
          if (readOnlyRef.current) return;
          if (skipClickRef.current) {
            skipClickRef.current = false;
            return;
          }
          if (dragRef.current?.started) return;
          e.preventDefault();
          handleActivate(n, { shiftKey: e.shiftKey });
        },
        onPointerDown: (e) => {
          if (readOnlyRef.current) return;
          if (e.button !== 0 && e.pointerType === "mouse") return;

          clearLongPress();
          const mode: "add" | "remove" = selectedRef.current.includes(n) ? "remove" : "add";

          dragRef.current = {
            active: true,
            started: false,
            mode,
            originX: e.clientX,
            originY: e.clientY,
            visited: new Set([n]),
            pointerId: e.pointerId,
          };

          if (e.pointerType === "touch") {
            longPressRef.current = {
              tooth: n,
              timer: setTimeout(() => {
                longPressRef.current = null;
                dragRef.current = null;
                skipClickRef.current = true;
                setMobileAnchor(n);
                setRangeEndpoints(new Set([n]));
                anchorRef.current = n;
                try {
                  navigator.vibrate?.(12);
                } catch {
                  /* ignore */
                }
              }, LONG_PRESS_MS),
            };
          }
        },
        onPointerEnter: (e) => {
          const drag = dragRef.current;
          if (!drag?.active || drag.pointerId !== e.pointerId) return;
          if (e.pointerType === "mouse" && e.buttons === 0) return;

          const dist = Math.hypot(e.clientX - drag.originX, e.clientY - drag.originY);
          if (!drag.started && dist < DRAG_THRESHOLD_PX) return;

          clearLongPress();
          if (!drag.started) {
            drag.started = true;
            skipClickRef.current = true;
            const origin = [...drag.visited][0];
            if (origin != null) paintTooth(origin, drag.mode);
          }

          if (!drag.visited.has(n)) {
            drag.visited.add(n);
            paintTooth(n, drag.mode);
            anchorRef.current = n;
          }
        },
        onPointerUp: () => {
          clearLongPress();
        },
        onPointerCancel: () => {
          clearLongPress();
          dragRef.current = null;
        },
      });
    }

    return map;
  }, [clearLongPress, handleActivate, paintTooth]);

  useEffect(() => {
    if (readOnly) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag?.active || drag.pointerId !== e.pointerId) return;
      const dist = Math.hypot(e.clientX - drag.originX, e.clientY - drag.originY);
      if (!drag.started && dist >= DRAG_THRESHOLD_PX) {
        clearLongPress();
        drag.started = true;
        skipClickRef.current = true;
        const origin = [...drag.visited][0];
        if (origin != null) paintTooth(origin, drag.mode);
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.pointerId === e.pointerId) {
        if (drag.started) skipClickRef.current = true;
        dragRef.current = null;
      }
      clearLongPress();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clearLongPress, paintTooth, readOnly]);

  const endpointSet = useMemo(() => {
    const s = new Set(rangeEndpoints);
    if (mobileAnchor != null) s.add(mobileAnchor);
    if (pendingRange) {
      s.add(pendingRange.start);
      s.add(pendingRange.end);
    }
    return s;
  }, [mobileAnchor, pendingRange, rangeEndpoints]);

  return {
    selectedSet,
    toggleTooth,
    toothInteractions,
    isSelected,
    statusOf,
    toggleGroup,
    selectAll,
    clearAll,
    invert,
    endpointSet,
    flashTeeth,
    mobileAnchor,
    pendingRange,
    confirmPendingRange,
    cancelPendingRange,
    UPPER_JAW_NUMBERS,
    LOWER_JAW_NUMBERS,
    RIGHT_SIDE_NUMBERS,
    LEFT_SIDE_NUMBERS,
  };
}
