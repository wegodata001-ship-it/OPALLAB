import type { Doctor, User, UserRole } from "@/lib/types";

const ROLE_PRIORITY: UserRole[] = [
  "OWNER",
  "ADMIN",
  "SECRETARY",
  "DESIGNER",
  "PRINTER",
  "MILLING",
  "PROCESSING",
  "FINISH",
  "PACKAGING",
  "DOCTOR",
  "ASSISTANT",
];

export function getUserRoles(user: Pick<User, "role" | "roles">): UserRole[] {
  if (user.roles?.length) return [...new Set(user.roles)];
  return [user.role];
}

export function primaryRole(roles: UserRole[]): UserRole {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return roles[0] ?? "DESIGNER";
}

export function userHasRole(user: Pick<User, "role" | "roles">, role: UserRole): boolean {
  return getUserRoles(user).includes(role);
}

export function userHasAnyRole(user: Pick<User, "role" | "roles">, roles: UserRole[]): boolean {
  const userRoles = getUserRoles(user);
  return roles.some((role) => userRoles.includes(role));
}

export function normalizeUserRoles(roles: UserRole[]): UserRole[] {
  const unique = [...new Set(roles.filter(Boolean))];
  if (!unique.length) throw new Error("נדרש לפחות תפקיד אחד");
  return unique;
}

export const EMPLOYEE_ROLES: UserRole[] = [
  "SECRETARY",
  "DESIGNER",
  "PRINTER",
  "MILLING",
  "PROCESSING",
  "FINISH",
  "PACKAGING",
];

export const PRODUCTION_ROLES: UserRole[] = [
  "DESIGNER",
  "PRINTER",
  "MILLING",
  "PROCESSING",
  "FINISH",
  "PACKAGING",
];

export function isLabEmployee(user: Pick<User, "role" | "roles">): boolean {
  return userHasAnyRole(user, [...EMPLOYEE_ROLES, "ADMIN", "OWNER"]);
}

export function isDoctorUser(user: Pick<User, "role" | "roles">): boolean {
  return userHasRole(user, "DOCTOR");
}

/** Attendance-only assistant (סייעת) — no business modules. */
export function isAssistantUser(user: Pick<User, "role" | "roles">): boolean {
  return userHasRole(user, "ASSISTANT") && !isSystemAdminUser(user) && !isDoctorUser(user);
}

/** True when the user may only use the assistant attendance screen. */
export function isAssistantOnlyUser(user: Pick<User, "role" | "roles">): boolean {
  const roles = getUserRoles(user);
  return roles.length > 0 && roles.every((r) => r === "ASSISTANT");
}

export function isSystemAdminUser(user: Pick<User, "role" | "roles">): boolean {
  return userHasAnyRole(user, ["ADMIN", "OWNER", "SECRETARY"]);
}

/** System administrator only (ADMIN / OWNER) — order soft/permanent delete. */
export function canDeleteOrders(user: Pick<User, "role" | "roles">): boolean {
  return userHasAnyRole(user, ["ADMIN", "OWNER"]);
}

export function getDoctorIdForUser(
  user: Pick<User, "id" | "role" | "roles">,
  doctors: Pick<Doctor, "id" | "userId">[],
): string | undefined {
  return doctors.find((d) => d.userId === user.id)?.id;
}
