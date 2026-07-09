import type { User, UserRole } from "@/lib/types";
import {
  getUserRoles,
  isDoctorUser,
  isSystemAdminUser,
  PRODUCTION_ROLES,
} from "@/lib/user-roles";

export type AppModule =
  | "dashboard"
  | "orders"
  | "workflow"
  | "inventory"
  | "accounts"
  | "shipping"
  | "attendance"
  | "portal"
  | "settings"
  | "my-work";

const ADMIN_MODULES: AppModule[] = [
  "dashboard",
  "orders",
  "workflow",
  "inventory",
  "accounts",
  "shipping",
  "attendance",
  "settings",
  "my-work",
];

const LAB_EMPLOYEE_MODULES: AppModule[] = [
  "dashboard",
  "orders",
  "workflow",
  "my-work",
];

const ROLE_MODULES: Record<UserRole, AppModule[]> = {
  ADMIN: ADMIN_MODULES,
  OWNER: ADMIN_MODULES,
  SECRETARY: ADMIN_MODULES,
  DESIGNER: LAB_EMPLOYEE_MODULES,
  PRINTER: LAB_EMPLOYEE_MODULES,
  MILLING: LAB_EMPLOYEE_MODULES,
  PROCESSING: LAB_EMPLOYEE_MODULES,
  FINISH: LAB_EMPLOYEE_MODULES,
  PACKAGING: [...LAB_EMPLOYEE_MODULES, "shipping"],
  DOCTOR: ["portal"],
};

export function canAccessModule(user: Pick<User, "role" | "roles">, module: AppModule): boolean {
  const roles = getUserRoles(user);
  return roles.some((role) => ROLE_MODULES[role]?.includes(module) ?? false);
}

/** @deprecated use canAccessModule */
export function canAccess(role: UserRole, module: AppModule): boolean {
  return ROLE_MODULES[role]?.includes(module) ?? false;
}

export function canAccessUser(user: Pick<User, "role" | "roles">, module: AppModule): boolean {
  return canAccessModule(user, module);
}

export function isSystemAdmin(role: UserRole): boolean {
  return role === "ADMIN" || role === "OWNER" || role === "SECRETARY";
}

export function isSystemAdminRole(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

export function isDoctorPortalUser(user: Pick<User, "role" | "roles">): boolean {
  return isDoctorUser(user) && !isSystemAdminUser(user);
}

export function canViewAllOrders(user: Pick<User, "role" | "roles">): boolean {
  if (isDoctorPortalUser(user)) return false;
  if (isSystemAdminUser(user)) return true;
  return getUserRoles(user).some((role) =>
    [...PRODUCTION_ROLES, "SECRETARY", "ADMIN", "OWNER", "PACKAGING"].includes(role),
  );
}

export function canEditOrders(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

export function canManageSettings(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

export function getDefaultRoute(user: Pick<User, "role" | "roles">): string {
  if (isDoctorPortalUser(user)) return "/portal";
  return "/dashboard";
}
