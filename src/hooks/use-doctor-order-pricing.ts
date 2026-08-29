"use client";

import { useMemo } from "react";
import { useApp } from "@/providers/AppProvider";
import {
  billableOptionsFromCatalog,
  buildPriceLines,
  resolveBillableCodes,
  type OrderPriceLine,
} from "@/lib/orders/doctor-pricing";

export type DoctorOrderPricingResult = {
  codes: string[];
  lines: OrderPriceLine[];
  total: number | null;
  missing: Array<{ code: string; label: string; catalogOptionId: string }>;
  hasSelections: boolean;
};

/** Resolve Doctor + form selections → price lines from that doctor's price book. */
export function useDoctorOrderPricing(input: {
  doctorId: string;
  materials: string[];
  workTypes: string[];
  splintTypeIds: string[];
}): DoctorOrderPricingResult {
  const { doctorPrices, orderCatalog, splintTypes } = useApp();

  return useMemo(() => {
    if (!input.doctorId) {
      return { codes: [], lines: [], total: null, missing: [], hasSelections: false };
    }

    const codes = resolveBillableCodes({
      materials: input.materials,
      workTypes: input.workTypes,
      splintTypeIds: input.splintTypeIds,
      splintTypes,
    });

    const billableOptions = billableOptionsFromCatalog(orderCatalog);
    const pricesByOptionId = new Map<string, number>();
    for (const row of doctorPrices) {
      if (row.doctorId === input.doctorId && row.isActive) {
        pricesByOptionId.set(row.catalogOptionId, row.price);
      }
    }

    const built = buildPriceLines({
      codes,
      billableOptions,
      pricesByOptionId,
      quantity: 1,
    });

    return {
      codes,
      lines: built.lines,
      total: built.total,
      missing: built.missing,
      hasSelections: codes.length > 0,
    };
  }, [
    input.doctorId,
    input.materials,
    input.workTypes,
    input.splintTypeIds,
    doctorPrices,
    orderCatalog,
    splintTypes,
  ]);
}
