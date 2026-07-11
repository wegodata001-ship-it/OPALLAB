import type { OrderStatus, User, UserRole, StageCompletion, Order } from "@/lib/types";
import { getUserRoles, isSystemAdminUser, userHasAnyRole } from "@/lib/user-roles";

const ADMIN_ROLES: UserRole[] = ["ADMIN", "OWNER", "SECRETARY"];

export const PRODUCTION_STAGES: { status: OrderStatus; label: string; roles: UserRole[] }[] = [
  { status: "DESIGN", label: "עיצוב", roles: ["DESIGNER", ...ADMIN_ROLES] },
  { status: "PRINTING_3D", label: "הדפסה 3D", roles: ["PRINTER", ...ADMIN_ROLES] },
  { status: "MILLING", label: "חריטה", roles: ["MILLING", ...ADMIN_ROLES] },
  { status: "PROCESSING", label: "עיבוד", roles: ["PROCESSING", ...ADMIN_ROLES] },
  { status: "FINISH", label: "גימור", roles: ["FINISH", ...ADMIN_ROLES] },
];

const PRIVILEGED_ROLES: UserRole[] = ADMIN_ROLES;

export function isPrivilegedRole(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

export function getStagesForRole(user: Pick<User, "role" | "roles">): OrderStatus[] {
  const roles = getUserRoles(user);
  const stages = PRODUCTION_STAGES.filter((s) => roles.some((r) => s.roles.includes(r))).map((s) => s.status);
  if (roles.includes("PACKAGING") && !stages.includes("PACKAGING")) {
    stages.push("PACKAGING");
  }
  return stages;
}

/** סינון הזמנות לעובדי ייצור — רק שלב נוכחי תואם להרשאות */
export function filterOrdersForProductionUser<T extends Order>(user: User, orders: T[]): T[] {
  if (isPrivilegedRole(user)) return orders;
  const myStages = getStagesForRole(user);
  if (!myStages.length) return [];
  return orders.filter((o) => myStages.includes(o.status));
}

export function canCompleteStage(
  user: User,
  stage: OrderStatus,
  orderStatus: OrderStatus,
  completedStages: Record<string, StageCompletion>,
): boolean {
  if (completedStages[stage]) return false;
  if (orderStatus !== stage) return false;
  const def = PRODUCTION_STAGES.find((s) => s.status === stage);
  return def ? userHasAnyRole(user, def.roles) : false;
}

/** עובד יכול לבטל רק שלב שסימן בעצמו; מנהל/מזכירות — כל שלב */
export function canUndoStage(
  user: User,
  stage: OrderStatus,
  completedStages: Record<string, StageCompletion>,
): boolean {
  const completion = completedStages[stage];
  if (!completion) return false;
  if (isPrivilegedRole(user)) return true;
  return completion.completedBy === user.id;
}

export function canViewOrderInWorkflow(
  user: User,
  orderStatus: OrderStatus,
  _completedStages: Record<string, StageCompletion>,
): boolean {
  if (isPrivilegedRole(user)) return true;
  return getStagesForRole(user).includes(orderStatus);
}

export function rolesSummary(roles: UserRole[]): string {
  return roles.map((r) => ROLE_PERMISSIONS_SUMMARY[r]).join(" · ");
}

export const ROLE_PERMISSIONS_SUMMARY: Record<UserRole, string> = {
  OWNER: "גישה מלאה — כל המודולים, ביטול כל שלב",
  ADMIN: "גישה מלאה — כל המודולים, ביטול כל שלב",
  SECRETARY: "הרשאות זהות למנהל — גישה מלאה לכל המערכת",
  DESIGNER: "עיצוב — סימון/ביטול שלב עיצוב בלבד",
  PRINTER: "הדפסה 3D — סימון/ביטול שלב ההדפסה בלבד",
  MILLING: "חריטה — סימון/ביטול שלב החריטה בלבד",
  PROCESSING: "עיבוד — סימון/ביטול שלב העיבוד בלבד",
  FINISH: "גימור — סימון/ביטול שלב הגימור בלבד",
  PACKAGING: "אריזה ושילוח — ללא שלבי ייצור במעקב",
  DOCTOR: "פורטל רופא — מעקב הזמנות וכרטסת בלבד",
};
