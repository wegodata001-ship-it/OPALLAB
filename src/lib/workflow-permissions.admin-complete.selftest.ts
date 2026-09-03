import {
  canAdminForceCompleteProduction,
  canForceCompleteOrderProduction,
} from "./workflow-permissions";
import type { UserRole } from "@/lib/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function user(role: UserRole, roles: UserRole[] = [role]) {
  return { role, roles };
}

function run() {
  assert(canAdminForceCompleteProduction(user("ADMIN")), "ADMIN ok");
  assert(canAdminForceCompleteProduction(user("OWNER")), "OWNER ok");
  assert(!canAdminForceCompleteProduction(user("SECRETARY")), "SECRETARY blocked");
  assert(!canAdminForceCompleteProduction(user("DESIGNER")), "DESIGNER blocked");
  assert(!canAdminForceCompleteProduction(user("ASSISTANT")), "ASSISTANT blocked");
  assert(
    canAdminForceCompleteProduction(user("ASSISTANT", ["ASSISTANT", "ADMIN"])),
    "ADMIN in roles ok",
  );

  assert(canForceCompleteOrderProduction("DESIGN"), "DESIGN allowed");
  assert(canForceCompleteOrderProduction("FINISH"), "FINISH allowed");
  assert(canForceCompleteOrderProduction("RECEIVED"), "RECEIVED allowed");
  assert(!canForceCompleteOrderProduction("PACKAGING"), "PACKAGING blocked");
  assert(!canForceCompleteOrderProduction("SHIPPED"), "SHIPPED blocked");
  assert(!canForceCompleteOrderProduction("DELIVERED"), "DELIVERED blocked");

  console.log("admin-complete-production.selftest: ALL PASSED");
}

run();
