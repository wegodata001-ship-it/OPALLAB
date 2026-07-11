import type { AppDataSnapshot } from "@/lib/services/app-data.service";
import type { User } from "@/lib/types";
import { canAccessModule, canViewAllOrders, isDoctorPortalUser } from "@/lib/permissions";
import { filterOrdersForProductionUser } from "@/lib/workflow-permissions";
import { getDoctorIdForUser, isSystemAdminUser } from "@/lib/user-roles";

export function filterSnapshotForUser(snapshot: AppDataSnapshot, user: User): AppDataSnapshot {
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

  if (!isSystemAdminUser(user) && !isDoctorPortalUser(user)) {
    filtered.orders = filterOrdersForProductionUser(user, snapshot.orders);
    const visibleOrderIds = new Set(filtered.orders.map((o) => o.id));
    filtered.shipments = snapshot.shipments.filter((s) => visibleOrderIds.has(s.orderId));
  } else if (!canViewAllOrders(user)) {
    filtered.orders = [];
    filtered.shipments = [];
  }

  filtered.auditLogs = [];

  return filtered;
}
