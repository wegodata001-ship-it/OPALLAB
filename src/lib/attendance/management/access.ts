import { userHasAnyRole } from "@/lib/user-roles";
import type { User } from "@/lib/types";

/**
 * Attendance management + manual time edit.
 * Roles: ADMIN / OWNER (מנהל) and SECRETARY (מזכירה).
 * ASSISTANT alone is excluded; ASSISTANT+SECRETARY is allowed via roles[].
 */
export function isAttendanceManager(user: Pick<User, "role" | "roles">): boolean {
  return userHasAnyRole(user, ["ADMIN", "OWNER", "SECRETARY"]);
}

/** Alias — same gate for editing check-in / check-out times. */
export function canEditAttendanceTimes(user: Pick<User, "role" | "roles">): boolean {
  return isAttendanceManager(user);
}
