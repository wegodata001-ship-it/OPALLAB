import type { UserRole } from "@/lib/types";

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
  "dashboard", "orders", "workflow", "inventory", "accounts",
  "shipping", "attendance", "settings", "my-work",
];

const ROLE_MODULES: Record<UserRole, AppModule[]> = {
  ADMIN: ADMIN_MODULES,
  OWNER: ADMIN_MODULES,
  SECRETARY: ADMIN_MODULES,
  DESIGNER: ["dashboard", "workflow", "orders", "my-work"],
  PRINTER: ["dashboard", "workflow", "my-work"],
  MILLING: ["dashboard", "workflow", "my-work"],
  PROCESSING: ["dashboard", "workflow", "my-work"],
  FINISH: ["dashboard", "workflow", "my-work"],
  PACKAGING: ["dashboard", "workflow", "shipping", "my-work"],
  DOCTOR: ["portal"],
};

export function canAccess(role: UserRole, module: AppModule): boolean {
  return ROLE_MODULES[role]?.includes(module) ?? false;
}

export function isSystemAdmin(role: UserRole): boolean {
  return role === "ADMIN" || role === "OWNER" || role === "SECRETARY";
}

export function canEditOrders(role: UserRole): boolean {
  return isSystemAdmin(role);
}

export function canManageSettings(role: UserRole): boolean {
  return isSystemAdmin(role);
}

export function getDefaultRoute(role: UserRole): string {
  if (role === "DOCTOR") return "/portal";
  return "/dashboard";
}
