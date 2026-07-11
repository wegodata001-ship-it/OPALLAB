import type { Prisma } from "@prisma/client";
import type { User } from "@/lib/types";
import { getUserRoles } from "@/lib/user-roles";
import type { UserRole } from "@/lib/types";

const PRIMARY_ADMIN_USERNAME = "admin";
const PROTECTED_ROLES: UserRole[] = ["ADMIN", "OWNER"];

export function isPrimarySystemUser(user: Pick<User, "id" | "username" | "role" | "roles">): boolean {
  if (user.username === PRIMARY_ADMIN_USERNAME) return true;
  const roles = getUserRoles(user);
  return roles.includes("ADMIN") || roles.includes("OWNER");
}

export function assertUserCanBeDeleted(
  target: Pick<User, "id" | "username" | "role" | "roles">,
  actorId: string,
): void {
  if (target.id === actorId) {
    throw new Error("לא ניתן למחוק את המשתמש המחובר כרגע.");
  }
  if (isPrimarySystemUser(target)) {
    throw new Error("לא ניתן למחוק את משתמש המערכת הראשי.");
  }
}

export function getProtectedUserWhere(): Prisma.UserWhereInput {
  return {
    OR: [
      { username: PRIMARY_ADMIN_USERNAME },
      { role: { in: PROTECTED_ROLES } },
      { roles: { hasSome: PROTECTED_ROLES } },
    ],
  };
}
