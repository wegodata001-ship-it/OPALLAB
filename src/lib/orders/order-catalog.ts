import type { OrderCatalogCategory, OrderCatalogOption } from "@/lib/types";

export const CATALOG_CATEGORY_LABELS: Record<OrderCatalogCategory, string> = {
  MATERIAL: "סוג חומר",
  WORK_TYPE: "סוג עבודה",
  SHADE: "צבע / Shade",
};

/** Legacy hardcoded labels — fallback for historic codes missing from catalog. */
export const LEGACY_MATERIAL_LABELS: Record<string, string> = {
  TEMPORARY: "זמני",
  DENTURE: "תותבת",
  PFM: "PFM",
  ZIRCONIA: "זירקוניה",
  TITANIUM: "טיטניום",
  MODEL: "מודל",
};

export const LEGACY_WORK_TYPE_LABELS: Record<string, string> = {
  SCREWED: "מוברג",
  ABUTMENTS: "מבנים",
  MOCKUP: "Mockup",
  BAR: "באר",
  NIGHT_GUARD_WHITENING_MILLED: "סד לילה / הלבנה / חרוט",
};

export const DEFAULT_CATALOG_SEED: Array<{
  category: OrderCatalogCategory;
  code: string;
  label: string;
  color?: string;
  group?: string;
  sortOrder: number;
}> = [
  { category: "MATERIAL", code: "TEMPORARY", label: "זמני", sortOrder: 10 },
  { category: "MATERIAL", code: "DENTURE", label: "תותבת", sortOrder: 20 },
  { category: "MATERIAL", code: "PFM", label: "PFM", sortOrder: 30 },
  { category: "MATERIAL", code: "ZIRCONIA", label: "זירקוניה", sortOrder: 40 },
  { category: "MATERIAL", code: "TITANIUM", label: "טיטניום", sortOrder: 50 },
  { category: "MATERIAL", code: "MODEL", label: "מודל", sortOrder: 60 },

  { category: "WORK_TYPE", code: "SCREWED", label: "מוברג", sortOrder: 10 },
  { category: "WORK_TYPE", code: "ABUTMENTS", label: "מבנים", sortOrder: 20 },
  { category: "WORK_TYPE", code: "MOCKUP", label: "Mockup", sortOrder: 30 },
  { category: "WORK_TYPE", code: "BAR", label: "באר", sortOrder: 40 },
  // NIGHT_GUARD kept in DB for legacy orders but hidden from chip UI via selectableWorkTypes

  { category: "SHADE", code: "A1", label: "A1", color: "#f5e6c8", group: "A", sortOrder: 10 },
  { category: "SHADE", code: "A2", label: "A2", color: "#edd9a8", group: "A", sortOrder: 20 },
  { category: "SHADE", code: "A3", label: "A3", color: "#e0c07a", group: "A", sortOrder: 30 },
  { category: "SHADE", code: "A3.5", label: "A3.5", color: "#d4a85c", group: "A", sortOrder: 40 },
  { category: "SHADE", code: "A4", label: "A4", color: "#c08a3e", group: "A", sortOrder: 50 },
  { category: "SHADE", code: "B1", label: "B1", color: "#f7eed8", group: "B", sortOrder: 60 },
  { category: "SHADE", code: "B2", label: "B2", color: "#efe0b8", group: "B", sortOrder: 70 },
  { category: "SHADE", code: "B3", label: "B3", color: "#e2c88a", group: "B", sortOrder: 80 },
  { category: "SHADE", code: "B4", label: "B4", color: "#d4b05e", group: "B", sortOrder: 90 },
  { category: "SHADE", code: "C1", label: "C1", color: "#e8e0d0", group: "C", sortOrder: 100 },
  { category: "SHADE", code: "C2", label: "C2", color: "#d6cbb0", group: "C", sortOrder: 110 },
  { category: "SHADE", code: "C3", label: "C3", color: "#c4b490", group: "C", sortOrder: 120 },
  { category: "SHADE", code: "C4", label: "C4", color: "#a8926c", group: "C", sortOrder: 130 },
  { category: "SHADE", code: "D2", label: "D2", color: "#e8dcc8", group: "D", sortOrder: 140 },
  { category: "SHADE", code: "D3", label: "D3", color: "#d4c4a0", group: "D", sortOrder: 150 },
  { category: "SHADE", code: "D4", label: "D4", color: "#b8a078", group: "D", sortOrder: 160 },
  { category: "SHADE", code: "BL1", label: "BL1", color: "#faf8f2", group: "BL", sortOrder: 170 },
  { category: "SHADE", code: "BL2", label: "BL2", color: "#f5f0e4", group: "BL", sortOrder: 180 },
  { category: "SHADE", code: "BL3", label: "BL3", color: "#efe8d6", group: "BL", sortOrder: 190 },
  { category: "SHADE", code: "BL4", label: "BL4", color: "#e8dfc8", group: "BL", sortOrder: 200 },
];

export function slugifyCatalogCode(label: string): string {
  const base = label
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return base || `OPT_${Date.now().toString(36).toUpperCase()}`;
}

export function catalogLabel(
  options: OrderCatalogOption[],
  category: OrderCatalogCategory,
  code: string,
): string {
  const hit = options.find((o) => o.category === category && o.code === code);
  if (hit) return hit.label;
  if (category === "MATERIAL") return LEGACY_MATERIAL_LABELS[code] ?? code;
  if (category === "WORK_TYPE") return LEGACY_WORK_TYPE_LABELS[code] ?? code;
  return code;
}

export function activeCatalogOptions(
  options: OrderCatalogOption[],
  category: OrderCatalogCategory,
): OrderCatalogOption[] {
  return options
    .filter((o) => o.category === category && o.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "he"));
}
