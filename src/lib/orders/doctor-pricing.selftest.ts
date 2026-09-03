/**
 * Pricing self-tests: REGULAR (teeth) + ALL IN X (jaws) + OTHER.
 * Run: npx tsx src/lib/orders/doctor-pricing.selftest.ts
 */
import {
  billingQuantityFromTeeth,
  computeOrderPricing,
  detectJaws,
  mergeOrderPricingSnapshot,
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

{
  const emptyServer = {
    totalPrice: null as number | null,
    calculatedPrice: null as number | null,
    priceLines: [] as import("./doctor-pricing").OrderPriceLine[],
    priceUnit: null as number | null,
    priceQuantity: 2,
    priceManuallyEdited: false,
    pricingMode: "REGULAR" as const,
    otherWorkKind: null,
    allInXType: null,
    pricePerJaw: null as number | null,
    jawCount: 1,
  };

  const fromClient = mergeOrderPricingSnapshot({
    client: {
      totalPrice: 540,
      calculatedPrice: 540,
      priceLines: [
        {
          catalogOptionId: "x",
          code: "ZIRCONIA",
          nameSnapshot: "זרקוניה",
          unitPrice: 270,
          quantity: 2,
          lineTotal: 540,
        },
      ],
      priceUnit: 270,
      priceQuantity: 2,
      priceManuallyEdited: false,
      pricingMode: "REGULAR",
    },
    server: emptyServer,
  });
  assert(fromClient.totalPrice === 540, "client snapshot wins");
  assert(fromClient.calculatedPrice === 540, "client calc");
  assert(fromClient.priceLines.length === 1, "client lines");

  const wipedWithoutMerge = emptyServer.totalPrice;
  assert(wipedWithoutMerge === null, "server alone null");

  const fromDraft = mergeOrderPricingSnapshot({
    client: {},
    server: emptyServer,
    existing: {
      totalPrice: 270,
      calculatedPrice: 270,
      priceLines: [
        {
          catalogOptionId: "x",
          code: "TEMPORARY_SCREWED",
          nameSnapshot: "זמני מוברג",
          unitPrice: 70,
          quantity: 1,
          lineTotal: 70,
        },
      ],
      pricingMode: "REGULAR",
    },
  });
  assert(fromDraft.totalPrice === 270, "finalize keeps draft price (no 270→null)");

  const free = mergeOrderPricingSnapshot({
    client: { otherWorkKind: "REWORK_FREE", totalPrice: 0 },
    server: { ...emptyServer, otherWorkKind: "REWORK_FREE", totalPrice: 0, calculatedPrice: 0 },
  });
  assert(free.totalPrice === 0, "rework free is zero not null");

  const aix = mergeOrderPricingSnapshot({
    client: {
      totalPrice: 8000,
      calculatedPrice: 8000,
      pricingMode: "ALL_IN_X",
      allInXType: "ALL_IN_X_ZIRCONIA",
      pricePerJaw: 4000,
      jawCount: 2,
    },
    server: {
      ...emptyServer,
      pricingMode: "ALL_IN_X",
      totalPrice: 8000,
      calculatedPrice: 8000,
      pricePerJaw: 4000,
      jawCount: 2,
      allInXType: "ALL_IN_X_ZIRCONIA",
    },
  });
  assert(aix.totalPrice === 8000, "ALL_IN_X two jaws");
  assert(aix.jawCount === 2, "jaw count snapshot");
}

console.log("doctor-pricing.selftest: ALL PASSED");
