/**
 * Pricing self-tests: REGULAR (teeth) + ALL IN X (jaws) + OTHER.
 * Run: npx tsx src/lib/orders/doctor-pricing.selftest.ts
 */
import {
  billingQuantityFromTeeth,
  computeOrderPricing,
  detectJaws,
  resolveFinalPrice,
} from "./doctor-pricing";
import type { OrderCatalogOption } from "@/lib/types";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const billable: OrderCatalogOption[] = [
  {
    id: "opt-z",
    category: "BILLABLE",
    code: "ZIRCONIA",
    label: "זרקוניה",
    sortOrder: 1,
    isActive: true,
    isSystem: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "opt-aix",
    category: "BILLABLE",
    code: "ALL_IN_X_ZIRCONIA",
    label: "All in X זרקוניה",
    sortOrder: 2,
    isActive: true,
    isSystem: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const prices = new Map([
  ["opt-z", 270],
  ["opt-aix", 4000],
]);

function book(teeth: number[]) {
  return computeOrderPricing({
    pricingMode: "REGULAR",
    materials: ["ZIRCONIA"],
    workTypes: [],
    splintTypeIds: [],
    splintTypes: [],
    selectedTeeth: teeth,
    billableOptions: billable,
    pricesByOptionId: prices,
  });
}

function aix(teeth: number[]) {
  return computeOrderPricing({
    pricingMode: "ALL_IN_X",
    materials: [],
    workTypes: [],
    splintTypeIds: [],
    splintTypes: [],
    selectedTeeth: teeth,
    billableOptions: billable,
    pricesByOptionId: prices,
    allInXType: "ALL_IN_X_ZIRCONIA",
  });
}

// REGULAR
assert(book([11]).calculatedPrice === 270, "R1");
assert(book([11, 12]).calculatedPrice === 540, "R2");
assert(book([11, 12, 13, 14]).calculatedPrice === 1080, "R3");
assert(
  resolveFinalPrice({
    calculatedPrice: 1080,
    priceManuallyEdited: true,
    manualFinalPrice: 1000,
    mode: "BOOK",
  }) === 1000,
  "R4 manual",
);

// ALL IN X jaws
assert(detectJaws([11]).jawCount === 1, "jaw A");
assert(aix([11]).calculatedPrice === 4000, "A");
assert(aix([11, 12, 13, 14, 15]).calculatedPrice === 4000, "B");
assert(aix([11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28]).calculatedPrice === 4000, "C upper");
assert(aix([31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48]).calculatedPrice === 4000, "D lower");
assert(aix([11, 31]).calculatedPrice === 8000, "E");
assert(aix([11, 12, 13, 14, 15, 16, 17, 18, 31, 32, 33, 34, 35, 36, 37, 38]).calculatedPrice === 8000, "F");
assert(aix([11, 12, 13, 14, 15, 16, 17, 18]).calculatedPrice === 4000, "G not × teeth");
assert(
  resolveFinalPrice({
    calculatedPrice: 8000,
    priceManuallyEdited: true,
    manualFinalPrice: 7500,
    mode: "ALL_IN_X",
  }) === 7500,
  "H manual",
);

// OTHER
const rework = computeOrderPricing({
  pricingMode: "OTHER",
  materials: [],
  workTypes: ["OTHER"],
  splintTypeIds: [],
  splintTypes: [],
  selectedTeeth: [11],
  billableOptions: billable,
  pricesByOptionId: prices,
  otherWorkKind: "REWORK_FREE",
});
assert(rework.calculatedPrice === 0, "OTHER rework");

const repair = computeOrderPricing({
  pricingMode: "OTHER",
  materials: [],
  workTypes: ["OTHER"],
  splintTypeIds: [],
  splintTypes: [],
  selectedTeeth: [],
  billableOptions: billable,
  pricesByOptionId: prices,
  otherWorkKind: "REPAIR_OTHER",
  repairPrice: 150,
});
assert(repair.calculatedPrice === 150, "OTHER repair");

assert(billingQuantityFromTeeth([11, 11, 12]) === 2, "unique teeth");

console.log("doctor-pricing.selftest: ALL PASSED");
