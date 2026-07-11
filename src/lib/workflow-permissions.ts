import type { OrderStatus, User, UserRole, StageCompletion, Order } from "@/lib/types";
import { getUserRoles, isSystemAdminUser, userHasAnyRole, userHasRole } from "@/lib/user-roles";

/** OWNER / ADMIN may complete any production stage without role restrictions. */
export const STAGE_COMPLETION_ADMIN_ROLES: UserRole[] = ["ADMIN", "OWNER"];

/** Maps each production stage to the employee role required to mark it complete. */
export const STAGE_REQUIRED_ROLE: Partial<Record<OrderStatus, UserRole>> = {
  DESIGN: "DESIGNER",
  PRINTING_3D: "PRINTER",
  MILLING: "MILLING",
  PROCESSING: "PROCESSING",
  FINISH: "FINISH",
  PACKAGING: "PACKAGING",
};

export const PRODUCTION_STAGES: { status: OrderStatus; label: string; roles: UserRole[] }[] = [
  { status: "DESIGN", label: "עיצוב", roles: ["DESIGNER", ...STAGE_COMPLETION_ADMIN_ROLES] },
  { status: "PRINTING_3D", label: "הדפסה 3D", roles: ["PRINTER", ...STAGE_COMPLETION_ADMIN_ROLES] },
  { status: "MILLING", label: "חריטה", roles: ["MILLING", ...STAGE_COMPLETION_ADMIN_ROLES] },
  { status: "PROCESSING", label: "עיבוד", roles: ["PROCESSING", ...STAGE_COMPLETION_ADMIN_ROLES] },
  { status: "FINISH", label: "גימור", roles: ["FINISH", ...STAGE_COMPLETION_ADMIN_ROLES] },
  { status: "PACKAGING", label: "אריזה", roles: ["PACKAGING", ...STAGE_COMPLETION_ADMIN_ROLES] },
];

export const STAGE_COMPLETION_FORBIDDEN_MESSAGE =
  "You are not authorized to complete this production stage.";

export type ProductionStageState = "WAITING" | "CURRENT" | "COMPLETED";

export function isPrivilegedRole(user: Pick<User, "role" | "roles">): boolean {
  return isSystemAdminUser(user);
}

export function isStageCompletionAdmin(user: Pick<User, "role" | "roles">): boolean {
  return userHasAnyRole(user, STAGE_COMPLETION_ADMIN_ROLES);
}

/** Role-only check — whether the user may ever mark this stage complete (ignores order state). */
export function hasStageCompletionRole(user: Pick<User, "role" | "roles">, stage: OrderStatus): boolean {
  if (isStageCompletionAdmin(user)) return true;
  const required = STAGE_REQUIRED_ROLE[stage];
  return required ? userHasRole(user, required) : false;
}

export function getStagesForRole(user: Pick<User, "role" | "roles">): OrderStatus[] {
  const roles = getUserRoles(user);
  return PRODUCTION_STAGES.filter((s) => roles.some((r) => s.roles.includes(r))).map((s) => s.status);
}

export function getProductionStageState(
  stage: OrderStatus,
  orderStatus: OrderStatus,
  completedStages: Record<string, StageCompletion>,
): ProductionStageState {
  if (completedStages[stage]) return "COMPLETED";

  const stageIndex = PRODUCTION_STAGES.findIndex((s) => s.status === stage);
  const currentIndex = PRODUCTION_STAGES.findIndex((s) => s.status === orderStatus);

  if (stageIndex < 0 || currentIndex < 0) return "WAITING";
  if (stageIndex < currentIndex) return "COMPLETED";
  if (stageIndex === currentIndex) return "CURRENT";
  return "WAITING";
}

/** Pipeline order for comparing whether an order is before/at/after the employee's stages. */
export const ORDER_PIPELINE: OrderStatus[] = [
  "RECEIVED",
  "FILES_ATTACHED",
  "DESIGN",
  "PRINTING_3D",
  "MILLING",
  "PROCESSING",
  "FINISH",
  "PACKAGING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

export type OrderStageRelevance = "mine" | "future" | "past" | "done";

export function getOrderStageRelevance(
  user: Pick<User, "role" | "roles">,
  status: OrderStatus,
): OrderStageRelevance {
  if (["SHIPPED", "DELIVERED", "CANCELLED"].includes(status)) return "done";

  const myStages = getStagesForRole(user);
  if (myStages.includes(status)) return "mine";

  const statusIdx = ORDER_PIPELINE.indexOf(status);
  const myIndices = myStages.map((s) => ORDER_PIPELINE.indexOf(s)).filter((i) => i >= 0);
  if (!myIndices.length || statusIdx < 0) return "future";

  const earliest = Math.min(...myIndices);
  const latest = Math.max(...myIndices);
  if (statusIdx < earliest) return "future";
  if (statusIdx > latest) return "past";
  return "past";
}

export const STAGE_RELEVANCE_LABELS: Record<OrderStageRelevance, string> = {
  mine: "בטיפול שלי",
  future: "שלב עתידי",
  past: "שלב קודם",
  done: "הושלמה",
};

export const STAGE_RELEVANCE_CARD_CLASS: Record<OrderStageRelevance, string> = {
  mine: "border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-200",
  future: "border-slate-200 bg-white",
  past: "border-slate-200 bg-slate-50/80 opacity-90",
  done: "border-slate-200 bg-slate-50 opacity-75",
};

export const STAGE_RELEVANCE_BADGE_CLASS: Record<OrderStageRelevance, string> = {
  mine: "bg-emerald-600 text-white",
  future: "bg-slate-100 text-slate-600",
  past: "bg-amber-50 text-amber-800 border border-amber-200",
  done: "bg-slate-100 text-slate-500",
};

/** @deprecated Prefer Prisma filter via buildOrderWhereForUser — kept for tests/utilities */
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
  if (!STAGE_REQUIRED_ROLE[stage]) return false;
  return hasStageCompletionRole(user, stage);
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
  PACKAGING: "אריזה — סימון/ביטול שלב האריזה בלבד",
  DOCTOR: "פורטל רופא — מעקב הזמנות וכרטסת בלבד",
};
