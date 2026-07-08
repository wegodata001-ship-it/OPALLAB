import type { OrderStatus, User, UserRole, StageCompletion } from "@/lib/types";

const ADMIN_ROLES: UserRole[] = ["ADMIN", "OWNER", "SECRETARY"];

export const PRODUCTION_STAGES: { status: OrderStatus; label: string; roles: UserRole[] }[] = [
  { status: "DESIGN", label: "עיצוב", roles: ["DESIGNER", ...ADMIN_ROLES] },
  { status: "PRINTING_3D", label: "הדפסה 3D", roles: ["PRINTER", ...ADMIN_ROLES] },
  { status: "MILLING", label: "חריטה", roles: ["MILLING", ...ADMIN_ROLES] },
  { status: "PROCESSING", label: "עיבוד", roles: ["PROCESSING", ...ADMIN_ROLES] },
  { status: "FINISH", label: "גימור", roles: ["FINISH", ...ADMIN_ROLES] },
];

const PRIVILEGED_ROLES: UserRole[] = ADMIN_ROLES;

export function isPrivilegedRole(role: UserRole): boolean {
  return PRIVILEGED_ROLES.includes(role);
}

export function getStagesForRole(role: UserRole): OrderStatus[] {
  return PRODUCTION_STAGES.filter((s) => s.roles.includes(role)).map((s) => s.status);
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
  return def?.roles.includes(user.role) ?? false;
}

/** עובד יכול לבטל רק שלב שסימן בעצמו; מנהל/מזכירות — כל שלב */
export function canUndoStage(
  user: User,
  stage: OrderStatus,
  completedStages: Record<string, StageCompletion>,
): boolean {
  const completion = completedStages[stage];
  if (!completion) return false;
  if (isPrivilegedRole(user.role)) return true;
  return completion.completedBy === user.id;
}

export function canViewOrderInWorkflow(
  user: User,
  orderStatus: OrderStatus,
  completedStages: Record<string, StageCompletion>,
): boolean {
  if (isPrivilegedRole(user.role)) return true;
  const myStages = getStagesForRole(user.role);
  if (myStages.includes(orderStatus)) return true;
  return myStages.some((stage) => completedStages[stage]?.completedBy === user.id);
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
