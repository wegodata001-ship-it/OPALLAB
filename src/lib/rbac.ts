/**
 * Server-side RBAC — never trust the UI.
 * All mutating APIs should call these asserts (or helpers that use them).
 */
import { AppError } from "@/lib/errors/app-error";
import { writeAuditLog } from "@/lib/audit-log";
import { requireSessionUserId } from "@/lib/auth/session";
import { canAccessModule, canCreateOrders, canEditOrders, canManageOrderCatalog, canManageSettings, type AppModule } from "@/lib/permissions";
import {
  getStagesForRole,
  hasStageCompletionRole,
  isPrivilegedRole,
  ORDER_PIPELINE,
  STAGE_REQUIRED_ROLE,
} from "@/lib/workflow-permissions";
import {
  getUserRoles,
  isDoctorUser,
  isSystemAdminUser,
  canDeleteOrders,
  PRODUCTION_ROLES,
  userHasAnyRole,
  userHasRole,
} from "@/lib/user-roles";
import type { OrderStatus, User } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { mapUser } from "@/lib/mappers/prisma-to-app";

export async function requireSessionUser(): Promise<User> {
  const userId = await requireSessionUserId();
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row || !row.isActive) {
    throw new AppError("UNAUTHORIZED", "נדרשת התחברות", 401);
  }
  return mapUser(row);
}

export async function logForbiddenAttempt(input: {
  user: Pick<User, "id" | "username" | "role" | "roles">;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await writeAuditLog({
      userId: input.user.id,
      action: "FORBIDDEN_ATTEMPT",
      entityType: input.entityType ?? "security",
      entityId: input.entityId ?? "n/a",
      details: {
        result: "Forbidden",
        attemptedAction: input.action,
        username: input.user.username,
        roles: getUserRoles(input.user),
        ...input.details,
        at: new Date().toISOString(),
      },
    });
  } catch {
    /* never block the 403 on audit failure */
  }
}

async function forbid(
  user: User,
  action: string,
  message: string,
  details?: Record<string, unknown>,
): Promise<never> {
  await logForbiddenAttempt({ user, action, details });
  throw new AppError("FORBIDDEN", message, 403, details);
}

/** Production staff (not owner/admin/secretary) — stage-scoped. */
export function isStageScopedStaff(user: Pick<User, "role" | "roles">): boolean {
  return userHasAnyRole(user, PRODUCTION_ROLES) && !isSystemAdminUser(user);
}

export function getVisibleProductionStatuses(user: Pick<User, "role" | "roles">): OrderStatus[] | null {
  if (isSystemAdminUser(user)) return null;
  if (isDoctorUser(user) && !isStageScopedStaff(user)) return null;
  if (!isStageScopedStaff(user)) return [];
  const stages = [...getStagesForRole(user)];
  // Packaging desk also needs FINISH orders that are ready to pack
  if (userHasAnyRole(user, ["PACKAGING"]) && !stages.includes("FINISH")) {
    stages.push("FINISH");
  }
  return stages;
}

export async function assertModuleAccess(user: User, module: AppModule, action = "MODULE_ACCESS"): Promise<void> {
  if (!canAccessModule(user, module)) {
    await forbid(user, action, "אין הרשאה למודול זה", { module });
  }
}

export async function assertCanCreateOrder(user: User): Promise<void> {
  if (!canCreateOrders(user)) {
    await forbid(user, "ORDER_CREATE", "אין הרשאה ליצור הזמנה");
  }
}

export async function assertCanEditOrder(user: User): Promise<void> {
  if (!canEditOrders(user)) {
    await forbid(user, "ORDER_EDIT", "אין הרשאה לערוך הזמנה");
  }
}

/** Soft delete / restore / permanent delete — ADMIN & OWNER only. */
export async function assertCanDeleteOrder(user: User, action = "ORDER_DELETE"): Promise<void> {
  if (!canDeleteOrders(user)) {
    await forbid(user, action, "רק מנהל מערכת יכול למחוק הזמנות");
  }
}

/** Bulk shipment signature — ADMIN / OWNER only (stricter than single-sign). */
export async function assertCanBulkSignShipments(user: User): Promise<void> {
  if (!canDeleteOrders(user)) {
    await forbid(
      user,
      "SHIPMENT_SIGNATURE_BULK",
      "רק מנהל מערכת יכול לבצע חתימה קבוצתית",
    );
  }
}

/**
 * Free-form status changes — Owner / Admin / Secretary.
 * Packaging may only set PACKAGING / SHIPPED (shipping desk).
 * Other production staff must use completeStage / undoStage.
 */
export async function assertCanFreelyChangeOrderStatus(
  user: User,
  targetStatus: OrderStatus,
): Promise<void> {
  if (isPrivilegedRole(user)) return;
  if (
    userHasAnyRole(user, ["PACKAGING"]) &&
    (targetStatus === "PACKAGING" || targetStatus === "SHIPPED")
  ) {
    return;
  }
  await forbid(user, "ORDER_STATUS_CHANGE", "אין הרשאה לשנות סטטוס ישירות — יש להשלים שלב ייצור", {
    attemptedStatus: targetStatus,
  });
}

export async function assertCanCompleteProductionStage(
  user: User,
  stage: OrderStatus,
): Promise<void> {
  if (hasStageCompletionRole(user, stage)) return;
  await forbid(user, `STAGE_COMPLETE_${stage}`, "You are not authorized to complete this production stage.", {
    stage,
    requiredRole: STAGE_REQUIRED_ROLE[stage] ?? null,
  });
}

/** ADMIN / OWNER only — one-click force-complete of production ("סיום עבודה"). */
export async function assertCanAdminForceCompleteProduction(user: User): Promise<void> {
  const { canAdminForceCompleteProduction } = await import("@/lib/workflow-permissions");
  if (!canAdminForceCompleteProduction(user)) {
    await forbid(
      user,
      "ORDER_ADMIN_COMPLETE_PRODUCTION",
      "רק מנהל מערכת יכול לסמן סיום עבודה",
    );
  }
}

export async function assertCanManagePeople(user: User): Promise<void> {
  if (!isSystemAdminUser(user)) {
    await forbid(user, "PEOPLE_MANAGE", "אין הרשאה לנהל משתמשים / רופאים / שליחים");
  }
}

export async function assertCanManageInventory(user: User): Promise<void> {
  if (!canAccessModule(user, "inventory") || !isSystemAdminUser(user)) {
    await forbid(user, "INVENTORY_MANAGE", "אין הרשאה לנהל מלאי");
  }
}

export async function assertCanManagePayments(user: User): Promise<void> {
  if (!canAccessModule(user, "accounts") || !isSystemAdminUser(user)) {
    await forbid(user, "PAYMENTS_MANAGE", "אין הרשאה לנהל תשלומים");
  }
}

export async function assertCanManageShipments(user: User): Promise<void> {
  if (isSystemAdminUser(user)) return;
  if (userHasAnyRole(user, ["PACKAGING"])) return;
  await forbid(user, "SHIPMENT_CREATE", "אין הרשאה להפיק תעודת משלוח");
}

export async function assertCanManageLabSettings(user: User): Promise<void> {
  if (!canManageSettings(user)) {
    await forbid(user, "LAB_SETTINGS", "אין הרשאה לערוך הגדרות מעבדה");
  }
}

/** ADMIN / OWNER only — order form catalog (materials, work types, shades). */
export async function assertCanManageOrderCatalog(user: User): Promise<void> {
  if (!canManageOrderCatalog(user)) {
    await forbid(user, "ORDER_CATALOG", "ניהול אפשרויות טופס הזמנה זמין למנהל מערכת בלבד");
  }
}

/** System reset — Owner only (not Admin / Secretary). */
export async function assertIsOwner(user: User, action = "OWNER_ONLY"): Promise<void> {
  if (!userHasRole(user, "OWNER")) {
    await forbid(user, action, "פעולה זו זמינה לבעלים (Owner) בלבד");
  }
}

export async function assertCanUploadOrderFile(user: User): Promise<void> {
  if (isSystemAdminUser(user) || isDoctorUser(user) || isStageScopedStaff(user)) return;
  await forbid(user, "ORDER_FILE_UPLOAD", "אין הרשאה להעלות קבצים");
}

/** Validate status transition for the actor. */
export function validateAllowedTransition(
  from: OrderStatus,
  to: OrderStatus,
  user: Pick<User, "role" | "roles">,
): boolean {
  if (from === to) return true;
  if (isPrivilegedRole(user)) {
    if (to === "CANCELLED") return true;
    return ORDER_PIPELINE.includes(from) && ORDER_PIPELINE.includes(to);
  }
  // Packaging desk: FINISH/PACKAGING → PACKAGING/SHIPPED
  if (userHasAnyRole(user, ["PACKAGING"])) {
    if (to === "PACKAGING" && (from === "FINISH" || from === "PACKAGING")) return true;
    if (to === "SHIPPED" && (from === "PACKAGING" || from === "FINISH")) return true;
  }
  return false;
}

export async function assertAllowedStatusTransition(
  user: User,
  from: OrderStatus,
  to: OrderStatus,
): Promise<void> {
  await assertCanFreelyChangeOrderStatus(user, to);
  if (!validateAllowedTransition(from, to, user)) {
    await forbid(user, "ORDER_STATUS_TRANSITION", "מעבר סטטוס אינו מורשה", { from, to });
  }
}
