import type { User, UserRole } from "@/lib/types";
import {
  getUserRoles,
  isAssistantOnlyUser,
  isDoctorUser,
  isSystemAdminUser,
  canDeleteOrders as canDeleteOrdersRole,
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
  | "my-work"
  | "my-attendance"
  | "attendance-management"
  | "trusted-devices"
  | "deleted-orders"
  | "calendar"
  | "assistant-attendance";

const ADMIN_MODULES: AppModule[] = [
  "dashboard",
  "orders",
  "workflow",
  "inventory",
  "accounts",
  "shipping",
  "attendance",
  "attendance-management",
  "trusted-devices",
  "settings",
  "my-work",
  "my-attendance",
  "calendar",
];

/** Soft/permanent delete inbox — ADMIN & OWNER only (not secretary). */
const SYSTEM_ADMIN_ONLY_MODULES: AppModule[] = ["deleted-orders"];

const LAB_EMPLOYEE_MODULES: AppModule[] = [
  "dashboard",
  "orders",
  "workflow",
  "my-work",
  "my-attendance",
];

const ROLE_MODULES: Record<UserRole, AppModule[]> = {
  ADMIN: [...ADMIN_MODULES, ...SYSTEM_ADMIN_ONLY_MODULES],
  OWNER: [...ADMIN_MODULES, ...SYSTEM_ADMIN_ONLY_MODULES],
  SECRETARY: ADMIN_MODULES,
  DESIGNER: LAB_EMPLOYEE_MODULES,
  PRINTER: LAB_EMPLOYEE_MODULES,
  MILLING: LAB_EMPLOYEE_MODULES,
  PROCESSING: LAB_EMPLOYEE_MODULES,
  FINISH: LAB_EMPLOYEE_MODULES,
  PACKAGING: [...LAB_EMPLOYEE_MODULES, "shipping"],
  DOCTOR: ["portal"],
  /** סייעת — attendance check-in/out only */
  ASSISTANT: ["assistant-attendance"],
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
  if (isAssistantOnlyUser(user)) return false;
  if (isSystemAdminUser(user)) return true;
  // Production staff see all orders; actions remain stage-gated on the server
  return getUserRoles(user).some((role) =>
    [...PRODUCTION_ROLES, "PACKAGING"].includes(role),
  );
}

export function canEditOrders(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

/** ADMIN / OWNER only — soft delete, restore, permanent delete. */
export function canDeleteOrders(user: Pick<User, "role" | "roles">): boolean {
  return canDeleteOrdersRole(user);
}

/** Doctors may create orders for themselves; admins create for any doctor. */
export function canCreateOrders(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user) || isDoctorUser(user);
}

export function canManageSettings(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

/** ADMIN / OWNER only — order form master data (materials, work types, shades, splints). */
export function canManageOrderCatalog(user: Pick<User, "role" | "roles">): boolean {
  return canDeleteOrders(user);
}

/** ADMIN / OWNER only — per-doctor price books. */
export function canManageDoctorPrices(user: Pick<User, "role" | "roles">): boolean {
  return canManageOrderCatalog(user);
}

export function getDefaultRoute(user: Pick<User, "role" | "roles">): string {
  if (isDoctorPortalUser(user)) return "/portal";
  if (isAssistantOnlyUser(user) || canAccessModule(user, "assistant-attendance")) {
    if (!canAccessModule(user, "dashboard")) return "/assistant";
  }
  return "/dashboard";
}
