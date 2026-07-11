import { getUserRoles } from "@/lib/user-roles";
import type { User } from "@/lib/types";

/** Attendance management UI/API — ADMIN role only. */
export function isAttendanceManager(user: Pick<User, "role" | "roles">): boolean {
  return getUserRoles(user).includes("ADMIN");
}
