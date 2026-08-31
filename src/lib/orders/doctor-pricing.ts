import type { OrderCatalogOption, SplintType } from "@/lib/types";
import { activeCatalogOptions } from "@/lib/orders/order-catalog";

/** Snapshot line stored on Order.priceLines at save time. */
export type OrderPriceLine = {
  catalogOptionId: string;
  code: string;
  nameSnapshot: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type PricingMode = "REGULAR" | "ALL_IN_X" | "OTHER";

/** OTHER work subtype (stored on Order.otherWorkKind). */
export type OtherWorkKind = "REWORK_FREE" | "REPAIR_OTHER";

export const OTHER_WORK_TYPE_CODE = "OTHER";

export const OTHER_WORK_KIND_LABELS: Record<OtherWorkKind, string> = {
  REWORK_FREE: "עבודה חוזרת – ללא חיוב",
  REPAIR_OTHER: "תיקון / עבודה אחרת",
};

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  REGULAR: "עבודה רגילה",
  ALL_IN_X: "ALL IN X",
  OTHER: "אחר",
};

/** FDI upper jaw: 11–18, 21–28 */
export const UPPER_JAW_FDI = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
]);
/** FDI lower jaw: 31–38, 41–48 */
export const LOWER_JAW_FDI = new Set([
  31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
]);

/** Regular billable SKUs for doctor price books (per tooth / unit). */
export const DEFAULT_BILLABLE_SEED: Array<{ code: string; label: string; sortOrder: number }> = [
  { code: "TEMPORARY", label: "זמני", sortOrder: 10 },
  { code: "TEMPORARY_SCREWED", label: "זמני מוברג", sortOrder: 20 },
  { code: "DENTURE", label: "תותבת", sortOrder: 30 },
  { code: "DENTURE_SCREWED", label: "תותבת מוברגת", sortOrder: 40 },
  { code: "PFM", label: "PFM", sortOrder: 50 },
  { code: "PFM_SCREWED", label: "PFM מוברג", sortOrder: 60 },
  { code: "ZIRCONIA", label: "זרקוניה", sortOrder: 70 },
  { code: "ZIRCONIA_SCREWED", label: "זרקוניה מוברג", sortOrder: 80 },
  { code: "TITANIUM_BAR", label: "טיטאניום באר", sortOrder: 90 },
  { code: "MODEL", label: "מודל", sortOrder: 100 },
  { code: "ABUTMENTS", label: "מבנה", sortOrder: 110 },
  { code: "MOCKUP", label: "Mock up", sortOrder: 120 },
  { code: "NIGHT_GUARD", label: "סד לילה", sortOrder: 130 },
  { code: "WHITENING", label: "סד הלבנה", sortOrder: 140 },
  { code: "SURGICAL", label: "סד חרוט", sortOrder: 150 },
  { code: "OMNIVAC", label: "סד OMNIVAC", sortOrder: 160 },
];

/**
 * ALL IN X billable SKUs — price is per jaw (לסת), not per tooth.
 * Stored in same BILLABLE catalog; filtered by ALL_IN_X_ prefix in UI.
 */
export const DEFAULT_ALL_IN_X_SEED: Array<{ code: string; label: string; sortOrder: number }> = [
  { code: "ALL_IN_X_TEMPORARY", label: "All in X זמני", sortOrder: 210 },
  { code: "ALL_IN_X_TEMPORARY_SCREWED", label: "All in X זמני מוברג", sortOrder: 220 },
  { code: "ALL_IN_X_DENTURE", label: "All in X תותבת", sortOrder: 230 },
  { code: "ALL_IN_X_DENTURE_SCREWED", label: "All in X תותבת מוברגת", sortOrder: 240 },
  { code: "ALL_IN_X_PFM", label: "All in X PFM", sortOrder: 250 },
  { code: "ALL_IN_X_PFM_SCREWED", label: "All in X PFM מוברג", sortOrder: 260 },
  { code: "ALL_IN_X_ZIRCONIA", label: "All in X זרקוניה", sortOrder: 270 },
  { code: "ALL_IN_X_ZIRCONIA_SCREWED", label: "All in X זרקוניה מוברגת", sortOrder: 280 },
  {
    code: "ALL_IN_X_ZIRCONIA_TITANIUM_BAR",
    label: "All in X זרקוניה עם באר טיטניום",
    sortOrder: 290,
  },
  {
    code: "ALL_IN_X_ZIRCONIA_TITANIUM_BAR_SCREWED",
    label: "All in X זרקוניה עם באר טיטניום מוברג",
    sortOrder: 300,
  },
];

/** Short labels for order form ALL IN X picker (without "All in X" prefix). */
export const ALL_IN_X_TYPE_SHORT_LABELS: Record<string, string> = {
  ALL_IN_X_TEMPORARY: "זמני",
  ALL_IN_X_TEMPORARY_SCREWED: "זמני מוברג",
  ALL_IN_X_DENTURE: "תותבת",
  ALL_IN_X_DENTURE_SCREWED: "תותבת מוברגת",
  ALL_IN_X_PFM: "PFM",
  ALL_IN_X_PFM_SCREWED: "PFM מוברג",
  ALL_IN_X_ZIRCONIA: "זרקוניה",
  ALL_IN_X_ZIRCONIA_SCREWED: "זרקוניה מוברגת",
  ALL_IN_X_ZIRCONIA_TITANIUM_BAR: "זרקוניה עם באר טיטניום",
  ALL_IN_X_ZIRCONIA_TITANIUM_BAR_SCREWED: "זרקוניה עם באר טיטניום מוברג",
};

const SCREWABLE_MATERIALS = new Set(["TEMPORARY", "DENTURE", "PFM", "ZIRCONIA"]);

export function isAllInXCode(code: string): boolean {
  return code.startsWith("ALL_IN_X_");
}

export function parsePricingMode(raw: unknown): PricingMode {
  if (raw === "ALL_IN_X" || raw === "OTHER" || raw === "REGULAR") return raw;
  return "REGULAR";
}

export function parseOtherWorkKind(raw: unknown): OtherWorkKind | null {
  if (raw === "REWORK_FREE" || raw === "REPAIR_OTHER") return raw;
  return null;
}

/** Unique FDI teeth — never double-count. */
export function billingQuantityFromTeeth(selectedTeeth: number[]): number {
  const unique = new Set(
    selectedTeeth.filter((t) => Number.isFinite(t) && Number.isInteger(t)),
  );
  return unique.size;
}

export function detectJaws(selectedTeeth: number[]): {
  hasUpperJaw: boolean;
  hasLowerJaw: boolean;
  jawCount: number;
} {
  const unique = new Set(
    selectedTeeth.filter((t) => Number.isFinite(t) && Number.isInteger(t)),
  );
  let hasUpperJaw = false;
  let hasLowerJaw = false;
  for (const t of unique) {
    if (UPPER_JAW_FDI.has(t)) hasUpperJaw = true;
    if (LOWER_JAW_FDI.has(t)) hasLowerJaw = true;
  }
  return {
    hasUpperJaw,
    hasLowerJaw,
    jawCount: (hasUpperJaw ? 1 : 0) + (hasLowerJaw ? 1 : 0),
  };
}

/**
 * Map REGULAR order form selections → billable catalog codes.
 */
export function resolveBillableCodes(input: {
  materials: string[];
  workTypes: string[];
  splintTypeIds: string[];
  splintTypes: Pick<SplintType, "id" | "code" | "isActive">[];
}): string[] {
  const codes: string[] = [];
  const screwed = input.workTypes.includes("SCREWED");
  const hasBar = input.workTypes.includes("BAR");

  for (const m of input.materials) {
    if (m === "TITANIUM") {
      if (hasBar) codes.push("TITANIUM_BAR");
      continue;
    }
    if (m === "MODEL") {
      codes.push("MODEL");
      continue;
    }
    if (SCREWABLE_MATERIALS.has(m)) {
      codes.push(screwed ? `${m}_SCREWED` : m);
    }
  }

  if (hasBar && !input.materials.includes("TITANIUM") && !codes.includes("TITANIUM_BAR")) {
    codes.push("TITANIUM_BAR");
  }

  for (const w of input.workTypes) {
    if (w === "ABUTMENTS") codes.push("ABUTMENTS");
    if (w === "MOCKUP") codes.push("MOCKUP");
  }

  for (const sid of input.splintTypeIds) {
    const st = input.splintTypes.find((s) => s.id === sid);
    if (st?.code) codes.push(st.code);
  }

  return [...new Set(codes)].filter((c) => !isAllInXCode(c));
}

export function parsePriceLines(raw: unknown): OrderPriceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const unitPrice = Number(r.unitPrice);
      const quantity = Number(r.quantity);
      const lineTotal = Number(r.lineTotal);
      if (!r.code || !Number.isFinite(unitPrice)) return null;
      return {
        catalogOptionId: String(r.catalogOptionId ?? ""),
        code: String(r.code),
        nameSnapshot: String(r.nameSnapshot ?? r.code),
        unitPrice,
        quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 1,
        lineTotal: Number.isFinite(lineTotal) ? lineTotal : unitPrice,
      } satisfies OrderPriceLine;
    })
    .filter((x): x is OrderPriceLine => x != null);
}

export function buildPriceLines(input: {
  codes: string[];
  billableOptions: OrderCatalogOption[];
  pricesByOptionId: Map<string, number>;
  quantity: number;
}): {
  lines: OrderPriceLine[];
  total: number | null;
  missing: Array<{ code: string; label: string; catalogOptionId: string }>;
} {
  const qty = Number.isFinite(input.quantity) && input.quantity >= 0 ? input.quantity : 0;
  const lines: OrderPriceLine[] = [];
  const missing: Array<{ code: string; label: string; catalogOptionId: string }> = [];

  for (const code of input.codes) {
    const opt = input.billableOptions.find((o) => o.code === code && o.isActive);
    if (!opt) continue;
    const price = input.pricesByOptionId.get(opt.id);
    if (price == null || !Number.isFinite(price)) {
      missing.push({ code: opt.code, label: opt.label, catalogOptionId: opt.id });
      continue;
    }
    lines.push({
      catalogOptionId: opt.id,
      code: opt.code,
      nameSnapshot: opt.label,
      unitPrice: price,
      quantity: qty,
      lineTotal: price * qty,
    });
  }

  if (lines.length === 0 && missing.length === 0) {
    return { lines: [], total: null, missing: [] };
  }
  if (missing.length > 0 && lines.length === 0) {
    return { lines: [], total: null, missing };
  }
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  return { lines, total: lines.length ? total : null, missing };
}

export function billableOptionsFromCatalog(catalog: OrderCatalogOption[]): OrderCatalogOption[] {
  return activeCatalogOptions(catalog, "BILLABLE");
}

export function regularBillableOptions(catalog: OrderCatalogOption[]): OrderCatalogOption[] {
  return billableOptionsFromCatalog(catalog).filter((o) => !isAllInXCode(o.code));
}

export function allInXBillableOptions(catalog: OrderCatalogOption[]): OrderCatalogOption[] {
  return billableOptionsFromCatalog(catalog).filter((o) => isAllInXCode(o.code));
}

export type OrderPricingComputeResult = {
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
  hasSelections: boolean;
};

/** Pure pricing compute — REGULAR (teeth) | ALL_IN_X (jaws) | OTHER. */
export function computeOrderPricing(input: {
  pricingMode?: PricingMode;
  materials: string[];
  workTypes: string[];
  splintTypeIds: string[];
  splintTypes: Pick<SplintType, "id" | "code" | "isActive">[];
  selectedTeeth: number[];
  billableOptions: OrderCatalogOption[];
  pricesByOptionId: Map<string, number>;
  otherWorkKind?: OtherWorkKind | null;
  repairPrice?: number | null;
  allInXType?: string | null;
}): OrderPricingComputeResult {
  const jaws = detectJaws(input.selectedTeeth);
  const toothQty = billingQuantityFromTeeth(input.selectedTeeth);
  const pricingMode: PricingMode =
    input.pricingMode ??
    (input.otherWorkKind || input.workTypes.includes(OTHER_WORK_TYPE_CODE)
      ? "OTHER"
      : "REGULAR");

  const emptyBase = {
    pricingMode,
    codes: [] as string[],
    lines: [] as OrderPriceLine[],
    missing: [] as Array<{ code: string; label: string; catalogOptionId: string }>,
    quantity: toothQty,
    unitPrice: null as number | null,
    pricePerJaw: null as number | null,
    jawCount: jaws.jawCount,
    hasUpperJaw: jaws.hasUpperJaw,
    hasLowerJaw: jaws.hasLowerJaw,
    allInXType: null as string | null,
    calculatedPrice: null as number | null,
    hasSelections: false,
  };

  if (pricingMode === "OTHER") {
    const kind = input.otherWorkKind ?? null;
    if (kind === "REWORK_FREE") {
      return {
        ...emptyBase,
        mode: "REWORK_FREE",
        unitPrice: 0,
        calculatedPrice: 0,
        hasSelections: true,
      };
    }
    if (kind === "REPAIR_OTHER") {
      const repair =
        input.repairPrice != null && Number.isFinite(input.repairPrice)
          ? input.repairPrice
          : null;
      return {
        ...emptyBase,
        mode: "REPAIR_OTHER",
        quantity: 1,
        unitPrice: repair,
        calculatedPrice: repair,
        hasSelections: true,
      };
    }
    return { ...emptyBase, mode: "EMPTY", hasSelections: true };
  }

  if (pricingMode === "ALL_IN_X") {
    const typeCode = input.allInXType?.trim() || null;
    if (!typeCode || !isAllInXCode(typeCode)) {
      return { ...emptyBase, mode: "EMPTY", hasSelections: Boolean(typeCode) };
    }
    const opt = input.billableOptions.find((o) => o.code === typeCode && o.isActive);
    if (!opt) {
      return {
        ...emptyBase,
        mode: "ALL_IN_X",
        codes: [typeCode],
        allInXType: typeCode,
        hasSelections: true,
        missing: [{ code: typeCode, label: typeCode, catalogOptionId: "" }],
      };
    }
    const pricePerJaw = input.pricesByOptionId.get(opt.id);
    if (pricePerJaw == null || !Number.isFinite(pricePerJaw)) {
      return {
        ...emptyBase,
        mode: "ALL_IN_X",
        codes: [typeCode],
        allInXType: typeCode,
        hasSelections: true,
        missing: [{ code: opt.code, label: opt.label, catalogOptionId: opt.id }],
      };
    }
    const jawCount = jaws.jawCount;
    const calculated = pricePerJaw * jawCount;
    const lines: OrderPriceLine[] = [
      {
        catalogOptionId: opt.id,
        code: opt.code,
        nameSnapshot: opt.label,
        unitPrice: pricePerJaw,
        quantity: jawCount,
        lineTotal: calculated,
      },
    ];
    return {
      ...emptyBase,
      mode: "ALL_IN_X",
      codes: [typeCode],
      lines,
      quantity: jawCount,
      unitPrice: pricePerJaw,
      pricePerJaw,
      allInXType: typeCode,
      calculatedPrice: calculated,
      hasSelections: true,
    };
  }

  // REGULAR
  const codes = resolveBillableCodes({
    materials: input.materials,
    workTypes: input.workTypes,
    splintTypeIds: input.splintTypeIds,
    splintTypes: input.splintTypes,
  });

  if (codes.length === 0) {
    return { ...emptyBase, mode: "EMPTY" };
  }

  const built = buildPriceLines({
    codes,
    billableOptions: input.billableOptions.filter((o) => !isAllInXCode(o.code)),
    pricesByOptionId: input.pricesByOptionId,
    quantity: toothQty,
  });

  const unitPrice = built.lines.length === 1 ? built.lines[0].unitPrice : null;

  return {
    ...emptyBase,
    mode: "BOOK",
    codes,
    lines: built.lines,
    missing: built.missing,
    quantity: toothQty,
    unitPrice,
    calculatedPrice: built.total,
    hasSelections: true,
  };
}

export function resolveFinalPrice(input: {
  calculatedPrice: number | null;
  priceManuallyEdited: boolean;
  manualFinalPrice: number | null | undefined;
  mode: OrderPricingComputeResult["mode"];
}): number | null {
  if (input.mode === "REWORK_FREE") return 0;
  if (input.mode === "REPAIR_OTHER") {
    if (input.manualFinalPrice != null && Number.isFinite(input.manualFinalPrice)) {
      return input.manualFinalPrice;
    }
    return input.calculatedPrice;
  }
  if (
    input.priceManuallyEdited &&
    input.manualFinalPrice != null &&
    Number.isFinite(input.manualFinalPrice)
  ) {
    return input.manualFinalPrice;
  }
  return input.calculatedPrice;
}

/**
 * Composition key for auto-recalc.
 * ALL_IN_X uses jawCount (not full tooth list) so adding teeth in same jaw
 * does not reset a manual override.
 */
export function pricingCompositionKey(input: {
  pricingMode: PricingMode;
  doctorId: string;
  materials: string[];
  workTypes: string[];
  splintTypeIds: string[];
  selectedTeeth: number[];
  otherWorkKind: OtherWorkKind | null;
  allInXType: string | null;
}): string {
  const jaws = detectJaws(input.selectedTeeth);
  if (input.pricingMode === "ALL_IN_X") {
    return [
      "ALL_IN_X",
      input.doctorId,
      input.allInXType ?? "",
      String(jaws.jawCount),
      jaws.hasUpperJaw ? "U" : "",
      jaws.hasLowerJaw ? "L" : "",
    ].join("::");
  }
  if (input.pricingMode === "OTHER") {
    return ["OTHER", input.doctorId, input.otherWorkKind ?? ""].join("::");
  }
  const teeth = [...new Set(input.selectedTeeth)].sort((a, b) => a - b).join(",");
  return [
    "REGULAR",
    input.doctorId,
    [...input.materials].sort().join("|"),
    [...input.workTypes].sort().join("|"),
    [...input.splintTypeIds].sort().join("|"),
    teeth,
  ].join("::");
}
