import { userHasAnyRole, isSystemAdminUser } from "@/lib/user-roles";
import type { User } from "@/lib/types";

/** Access manager calendar module. */
export function canAccessCalendar(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

/** Create / edit / move meetings (admin + secretary). */
export function canEditCalendarEvents(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

/** Delete any event including system — ADMIN / OWNER only. */
export function canDeleteAnyCalendarEvent(user: Pick<User, "role" | "roles">): boolean {
  return userHasAnyRole(user, ["ADMIN", "OWNER"]);
}

/** Secretary may delete manual events only (not isSystem). */
export function canDeleteCalendarEvent(
  user: Pick<User, "role" | "roles">,
  event: { isSystem: boolean },
): boolean {
  if (canDeleteAnyCalendarEvent(user)) return true;
  if (!canEditCalendarEvents(user)) return false;
  return !event.isSystem;
}
