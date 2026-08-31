"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/providers/AppProvider";
import {
  billableOptionsFromCatalog,
  computeOrderPricing,
  pricingCompositionKey,
  resolveFinalPrice,
  type OtherWorkKind,
  type PricingMode,
  type OrderPriceLine,
} from "@/lib/orders/doctor-pricing";

export type OrderPricingFormState = {
  pricingMode: PricingMode;
  mode: "BOOK" | "ALL_IN_X" | "REWORK_FREE" | "REPAIR_OTHER" | "EMPTY";
  codes: string[];
  lines: OrderPriceLine[];
  missing: Array<{ code: string; label: string; catalogOptionId: string }>;
  quantity: number;
  unitPrice: number | null;
  pricePerJaw: number | null;
  jawCount: number;
  hasUpperJaw: boolean;
  hasLowerJaw: boolean;
  allInXType: string | null;
  calculatedPrice: number | null;
  finalPrice: number | null;
  priceManuallyEdited: boolean;
  hasSelections: boolean;
  setFinalPrice: (value: number | null) => void;
  compositionKey: string;
};

/** Live order pricing: REGULAR / ALL_IN_X / OTHER + manual override. */
export function useOrderPricingForm(input: {
  doctorId: string;
  pricingMode: PricingMode;
  materials: string[];
  workTypes: string[];
  splintTypeIds: string[];
  selectedTeeth: number[];
  otherWorkKind: OtherWorkKind | null;
  allInXType: string | null;
  initial?: {
    finalPrice: number | null;
    priceManuallyEdited: boolean;
  };
}): OrderPricingFormState {
  const { doctorPrices, orderCatalog, splintTypes } = useApp();
  const [manualFinal, setManualFinal] = useState<number | null>(
    input.initial?.finalPrice ?? null,
  );
  const [manuallyEdited, setManuallyEdited] = useState(
    Boolean(input.initial?.priceManuallyEdited),
  );
  const lastKeyRef = useRef<string | null>(null);
  const seededRef = useRef(false);

  const compositionKey = pricingCompositionKey({
    pricingMode: input.pricingMode,
    doctorId: input.doctorId,
    materials: input.materials,
    workTypes: input.workTypes,
    splintTypeIds: input.splintTypeIds,
    selectedTeeth: input.selectedTeeth,
    otherWorkKind: input.otherWorkKind,
    allInXType: input.allInXType,
  });

  const computed = useMemo(() => {
    const pricesByOptionId = new Map<string, number>();
    for (const row of doctorPrices) {
      if (row.doctorId === input.doctorId && row.isActive) {
        pricesByOptionId.set(row.catalogOptionId, row.price);
      }
    }

    return computeOrderPricing({
      pricingMode: input.pricingMode,
      materials: input.pricingMode === "REGULAR" ? input.materials : [],
      workTypes: input.pricingMode === "REGULAR" ? input.workTypes : [],
      splintTypeIds: input.pricingMode === "REGULAR" ? input.splintTypeIds : [],
      splintTypes,
      selectedTeeth: input.selectedTeeth,
      billableOptions: billableOptionsFromCatalog(orderCatalog),
      pricesByOptionId,
      otherWorkKind: input.pricingMode === "OTHER" ? input.otherWorkKind : null,
      repairPrice: manuallyEdited ? manualFinal : manualFinal,
      allInXType: input.pricingMode === "ALL_IN_X" ? input.allInXType : null,
    });
  }, [
    input.doctorId,
    input.pricingMode,
    input.materials,
    input.workTypes,
    input.splintTypeIds,
    input.selectedTeeth,
    input.otherWorkKind,
    input.allInXType,
    doctorPrices,
    orderCatalog,
    splintTypes,
    manualFinal,
    manuallyEdited,
  ]);

  useEffect(() => {
    if (seededRef.current) return;
    if (!input.initial) {
      seededRef.current = true;
      lastKeyRef.current = compositionKey;
      return;
    }
    seededRef.current = true;
    lastKeyRef.current = compositionKey;
    setManualFinal(input.initial.finalPrice);
    setManuallyEdited(Boolean(input.initial.priceManuallyEdited));
  }, [input.initial, compositionKey]);

  useEffect(() => {
    if (!seededRef.current) return;
    if (lastKeyRef.current == null) {
      lastKeyRef.current = compositionKey;
      return;
    }
    if (lastKeyRef.current === compositionKey) return;
    lastKeyRef.current = compositionKey;
    setManuallyEdited(false);
    if (computed.mode === "REWORK_FREE") setManualFinal(0);
    else if (computed.mode === "REPAIR_OTHER") setManualFinal((prev) => prev);
    else setManualFinal(computed.calculatedPrice);
  }, [compositionKey, computed.mode, computed.calculatedPrice]);

  useEffect(() => {
    if (manuallyEdited) return;
    if (computed.mode === "REWORK_FREE") {
      setManualFinal(0);
      return;
    }
    if (computed.mode === "REPAIR_OTHER") return;
    setManualFinal(computed.calculatedPrice);
  }, [computed.calculatedPrice, computed.mode, manuallyEdited]);

  const finalPrice = resolveFinalPrice({
    calculatedPrice: computed.calculatedPrice,
    priceManuallyEdited: manuallyEdited || computed.mode === "REPAIR_OTHER",
    manualFinalPrice: manualFinal,
    mode: computed.mode,
  });

  const setFinalPrice = (value: number | null) => {
    if (computed.mode === "REWORK_FREE") {
      setManuallyEdited(false);
      setManualFinal(0);
      return;
    }
    setManualFinal(value);
    setManuallyEdited(true);
  };

  return {
    pricingMode: computed.pricingMode,
    mode: computed.mode,
    codes: computed.codes,
    lines: computed.lines,
    missing: computed.missing,
    quantity: computed.quantity,
    unitPrice: computed.unitPrice,
    pricePerJaw: computed.pricePerJaw,
    jawCount: computed.jawCount,
    hasUpperJaw: computed.hasUpperJaw,
    hasLowerJaw: computed.hasLowerJaw,
    allInXType: computed.allInXType,
    calculatedPrice: computed.calculatedPrice,
    finalPrice,
    priceManuallyEdited: manuallyEdited || computed.mode === "REPAIR_OTHER",
    hasSelections: computed.hasSelections || input.pricingMode === "OTHER",
    setFinalPrice,
    compositionKey,
  };
}
