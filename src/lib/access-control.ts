import type { Prisma } from "@prisma/client";
import type { AppDataSnapshot } from "@/lib/services/app-data.service";
import type { Doctor, User } from "@/lib/types";
import { canAccessModule, canViewAllOrders, isDoctorPortalUser } from "@/lib/permissions";
import { getDoctorIdForUser, isAssistantOnlyUser, isLabEmployee, isSystemAdminUser, userHasRole } from "@/lib/user-roles";

/**
 * Prisma filter for orders visible to a user.
 * - Admin / secretary / owner / lab employees: all orders (actions are gated separately)
 * - Doctor portal: linked doctor only
 */
export function buildOrderWhereForUser(
  user: User,
  doctors: Pick<Doctor, "id" | "userId">[],
): Prisma.OrderWhereInput | null {
  if (isAssistantOnlyUser(user) || (userHasRole(user, "ASSISTANT") && !canAccessModule(user, "orders"))) {
    return { id: { in: [] } };
  }

  if (isDoctorPortalUser(user)) {
    const doctorId = getDoctorIdForUser(user, doctors);
    if (!doctorId) return { id: { in: [] } };
    return { doctorId };
  }

  if (isSystemAdminUser(user) || isLabEmployee(user)) {
    return null;
  }

  return { id: { in: [] } };
}

export function filterSnapshotForUser(snapshot: AppDataSnapshot, user: User): AppDataSnapshot {
  if (isAssistantOnlyUser(user) || (userHasRole(user, "ASSISTANT") && !canAccessModule(user, "dashboard"))) {
    const me = snapshot.users.find((u) => u.id === user.id);
    return {
      ...snapshot,
      users: me ? [me] : [],
      doctors: [],
      couriers: [],
      payments: [],
      orders: [],
      inventory: [],
      inventoryCategories: [],
      movements: [],
      shipments: [],
      attendance: [],
      labSettings: { labLatitude: null, labLongitude: null, geofenceRadiusMeters: null, gateToken: null },
      warehouses: [],
      auditLogs: [],
      splintTypes: [],
      orderCatalog: [],
    };
  }

  if (isDoctorPortalUser(user)) {
    const doctorId = getDoctorIdForUser(user, snapshot.doctors);
    return {
      ...snapshot,
      users: [],
      couriers: [],
      inventory: [],
      inventoryCategories: [],
      movements: [],
      payments: doctorId
        ? snapshot.payments.filter((p) => p.doctorId === doctorId)
        : [],
      orders: doctorId
        ? snapshot.orders.filter((o) => o.doctorId === doctorId)
        : [],
      shipments: doctorId
        ? snapshot.shipments.filter((s) =>
            snapshot.orders.some((o) => o.id === s.orderId && o.doctorId === doctorId),
          )
        : [],
      attendance: [],
      labSettings: snapshot.labSettings,
      doctors: doctorId
        ? snapshot.doctors.filter((d) => d.id === doctorId)
        : [],
      warehouses: [],
      auditLogs: [],
    };
  }

  const filtered: AppDataSnapshot = { ...snapshot };

  if (!canAccessModule(user, "settings")) {
    filtered.users = [];
    filtered.couriers = [];
    filtered.labSettings = snapshot.labSettings;
  }

  if (!canAccessModule(user, "inventory")) {
    filtered.inventory = [];
    filtered.inventoryCategories = [];
    filtered.movements = [];
    filtered.warehouses = [];
  }

  if (!canAccessModule(user, "accounts")) {
    filtered.payments = [];
    filtered.doctors = canViewAllOrders(user) ? snapshot.doctors : [];
  }

  if (!canAccessModule(user, "attendance")) {
    filtered.attendance = [];
  }

  // Lab staff see all orders; shipments follow visible orders
  if (canViewAllOrders(user)) {
    const visibleOrderIds = new Set(filtered.orders.map((o) => o.id));
    if (!canAccessModule(user, "shipping") && !isSystemAdminUser(user)) {
      // Keep shipment refs for order context, but packaging module still owns the shipping desk
      filtered.shipments = snapshot.shipments.filter((s) => visibleOrderIds.has(s.orderId));
    }
  } else {
    filtered.orders = [];
    filtered.shipments = [];
  }

  filtered.auditLogs = [];

  return filtered;
}
