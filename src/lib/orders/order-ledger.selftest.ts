import {
  shouldBillOrderOnStatusTransition,
  workChargeDescription,
  priceAdjustmentDescription,
  assertOrderPriceReadyForBilling,
  MISSING_ORDER_PRICE_MESSAGE,
} from "./order-ledger";
import { AppError } from "@/lib/errors/app-error";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function run() {
  assert(shouldBillOrderOnStatusTransition("FINISH", "PACKAGING"), "FINISH→PACKAGING bills");
  assert(shouldBillOrderOnStatusTransition("DESIGN", "PACKAGING"), "DESIGN→PACKAGING bills");
  assert(shouldBillOrderOnStatusTransition("FINISH", "SHIPPED"), "FINISH→SHIPPED bills");
  assert(!shouldBillOrderOnStatusTransition("PACKAGING", "SHIPPED"), "PACKAGING→SHIPPED no rebill");
  assert(!shouldBillOrderOnStatusTransition("SHIPPED", "DELIVERED"), "SHIPPED→DELIVERED no rebill");
  assert(!shouldBillOrderOnStatusTransition("DESIGN", "PRINTING_3D"), "mid pipeline no bill");
  assert(workChargeDescription("OP26-1") === "חיוב עבודה OP26-1", "desc");

  const adj = priceAdjustmentDescription({
    serialNumber: "OP26-1",
    previousAmount: 810,
    newAmount: 750,
    reason: "הנחה",
  });
  assert(adj.includes("810"), "adj old");
  assert(adj.includes("750"), "adj new");
  assert(adj.includes("-60"), "adj delta");
  assert(adj.includes("הנחה"), "adj reason");

  const up = priceAdjustmentDescription({
    serialNumber: "OP26-1",
    previousAmount: 810,
    newAmount: 900,
    reason: "תוספת",
  });
  assert(up.includes("+90"), "up delta");

  let blocked = false;
  try {
    assertOrderPriceReadyForBilling({ totalPrice: null });
  } catch (e) {
    blocked = e instanceof AppError && e.message === MISSING_ORDER_PRICE_MESSAGE;
  }
  assert(blocked, "null price blocks complete");

  assertOrderPriceReadyForBilling({ totalPrice: 0 });
  assertOrderPriceReadyForBilling({ totalPrice: 500 });
  assertOrderPriceReadyForBilling({ totalPrice: null, otherWorkKind: "REWORK_FREE" });

  console.log("order-ledger.selftest: ALL PASSED");
}

run();
