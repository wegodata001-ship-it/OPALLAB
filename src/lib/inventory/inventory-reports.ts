export const REPORT_KINDS = [
  "all-products",
  "current-stock",
  "by-category",
  "by-model",
  "drills",
  "count-full",
  "count-status",
  "differences",
  "uncounted",
  "count-history",
  "movements",
  "low-zero",
  "with-media",
  "missing-media",
] as const;

export type InventoryReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_LABELS: Record<InventoryReportKind, string> = {
  "all-products": "דוח כל המוצרים",
  "current-stock": "דוח מלאי נוכחי",
  "by-category": "דוח לפי קטגוריות",
  "by-model": "דוח לפי דגמים וסוגי חומרים",
  drills: "דוח מלאי מקדחים",
  "count-full": "דוח ספירת מלאי מלאה",
  "count-status": "דוח מצב ספירה",
  differences: "דוח הפרשי מלאי",
  uncounted: "דוח מוצרים שלא נספרו",
  "count-history": "דוח היסטוריית ספירות",
  movements: "דוח תנועות מלאי",
  "low-zero": "דוח מלאי נמוך / אפס",
  "with-media": "דוח מוצרים עם תמונות וברקודים",
  "missing-media": "דוח מוצרים ללא תמונות או ברקודים",
};

export type ReportModule = "ZIRCONIA" | "TITANIUM" | "BMMA" | "DRILLS" | "IMPLANTS" | "CLINIC_MATERIALS" | "OTHER_MATERIALS" | "DOCTOR_PARTS" | "CLASSIC";

export const MODULE_LABELS: Record<ReportModule, string> = {
  ZIRCONIA: "זרקוניה",
  TITANIUM: "טיטניום",
  BMMA: "BMMA",
  DRILLS: "מקדחים",
  IMPLANTS: "שתלים",
  CLINIC_MATERIALS: "חומרים למרפאה",
  OTHER_MATERIALS: "חומרים שונים",
  DOCTOR_PARTS: "חלקים רופאים",
  CLASSIC: "מלאי קלאסי",
};

export type CountStatus = "DRAFT" | "APPROVED" | "CANCELLED";

export function parseReportKind(value: string | null | undefined): InventoryReportKind {
  if (value && REPORT_KINDS.includes(value as InventoryReportKind)) return value as InventoryReportKind;
  throw new Error("סוג דוח לא תקין");
}

export type CountLineSnapshot = {
  itemId: string;
  countedQuantity: number | null;
  quantityAtStart: number | null;
  quantityAfter: number | null;
  difference: number | null;
  notes: string;
};

export type LineReading = {
  state: "uncounted" | "shortage" | "surplus" | "match";
  label: "לא נספר" | "חוסר" | "עודף" | "תקין";
  difference: number | null;
  percent: number | null;
};

export function readCountLine(line: Pick<CountLineSnapshot, "countedQuantity" | "quantityAtStart" | "difference">): LineReading {
  if (line.countedQuantity === null) return { state: "uncounted", label: "לא נספר", difference: null, percent: null };
  const difference = line.difference ?? line.countedQuantity - (line.quantityAtStart ?? 0);
  const base = line.quantityAtStart;
  const percent = base === null || base === 0 ? null : Math.round((difference / Math.abs(base)) * 100);
  if (difference < 0) return { state: "shortage", label: "חוסר", difference, percent };
  if (difference > 0) return { state: "surplus", label: "עודף", difference, percent };
  return { state: "match", label: "תקין", difference: 0, percent: 0 };
}

export type CountProgress = {
  expected: number;
  counted: number;
  remaining: number;
  shortage: number;
  surplus: number;
  matched: number;
  review: number;
  percent: number;
  status: "טרם התחילה" | "בתהליך" | "ממתינה לבדיקה" | "הושלמה" | "אושרה";
};

export function countProgress(status: CountStatus | null, lines: Pick<CountLineSnapshot, "countedQuantity" | "quantityAtStart" | "difference">[]): CountProgress {
  const expected = lines.length;
  const readings = lines.map(readCountLine);
  const counted = readings.filter((line) => line.state !== "uncounted").length;
  const shortage = readings.filter((line) => line.state === "shortage").length;
  const surplus = readings.filter((line) => line.state === "surplus").length;
  const matched = readings.filter((line) => line.state === "match").length;
  const review = readings.filter((line) => line.state === "shortage" || line.state === "surplus").length;
  const percent = expected === 0 ? 0 : Math.round((counted / expected) * 100);
  let label: CountProgress["status"] = "טרם התחילה";
  if (!status || expected === 0) label = "טרם התחילה";
  else if (status === "APPROVED") label = counted === expected ? "הושלמה" : "אושרה";
  else if (counted === 0) label = "טרם התחילה";
  else if (status === "DRAFT" && counted === expected) label = "ממתינה לבדיקה";
  else if (status === "DRAFT") label = "בתהליך";
  return { expected, counted, remaining: expected - counted, shortage, surplus, matched, review, percent, status: label };
}

export function treatmentLabel(status: CountStatus) {
  if (status === "APPROVED") return "אושר ועודכן";
  if (status === "CANCELLED") return "הספירה בוטלה";
  return "ממתין לאישור";
}
