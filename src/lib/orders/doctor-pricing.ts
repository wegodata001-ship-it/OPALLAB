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

export type DoctorPriceRow = {
  id: string;
  doctorId: string;
  catalogOptionId: string;
  price: number;
  isActive: boolean;
  code?: string;
  label?: string;
};

/** Seeded billable SKUs for doctor price books (no prices). */
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

const SCREWABLE_MATERIALS = new Set(["TEMPORARY", "DENTURE", "PFM", "ZIRCONIA"]);

/**
 * Map order form selections → billable catalog codes.
 * Quantity is always 1 per resolved line (teeth count is NOT used for billing).
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
    // BAR without titanium material — still map to titanium bar SKU if selected alone
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

  return [...new Set(codes)];
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
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        lineTotal: Number.isFinite(lineTotal) ? lineTotal : unitPrice,
      } satisfies OrderPriceLine;
    })
    .filter((x): x is OrderPriceLine => x != null);
}

export function buildPriceLines(input: {
  codes: string[];
  billableOptions: OrderCatalogOption[];
  pricesByOptionId: Map<string, number>;
  /** Business quantity per line — default 1 (not teeth count). */
  quantity?: number;
}): {
  lines: OrderPriceLine[];
  total: number | null;
  missing: Array<{ code: string; label: string; catalogOptionId: string }>;
} {
  const qty = input.quantity && input.quantity > 0 ? input.quantity : 1;
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
    const unitPrice = price;
    lines.push({
      catalogOptionId: opt.id,
      code: opt.code,
      nameSnapshot: opt.label,
      unitPrice,
      quantity: qty,
      lineTotal: unitPrice * qty,
    });
  }

  if (lines.length === 0 && missing.length === 0) {
    return { lines: [], total: null, missing: [] };
  }
  if (missing.length > 0 && lines.length === 0) {
    return { lines: [], total: null, missing };
  }
  // Partial: sum known lines; still report missing
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  return { lines, total: lines.length ? total : null, missing };
}

export function billableOptionsFromCatalog(catalog: OrderCatalogOption[]): OrderCatalogOption[] {
  return activeCatalogOptions(catalog, "BILLABLE");
}
