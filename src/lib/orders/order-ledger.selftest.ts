import {
  shouldBillOrderOnStatusTransition,
  workChargeDescription,
} from "./order-ledger";

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
  console.log("order-ledger.selftest: ALL PASSED");
}

run();
