/**
 * Full operational wipe — keep only admin / 123456.
 * Clears: attendance, orders, shipments, users (except recreated admin),
 * doctors, couriers, patients, payments, trusted devices, audit logs.
 *
 * Usage: npx tsx scripts/reset-admin-only.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import {
  createAuthUser,
  deleteAuthUser,
  updateAuthUser,
} from "../src/lib/supabase/auth-admin";
import { getSupabaseAdmin } from "../src/lib/supabase/admin";
import { emptyOperationalStorage } from "../src/lib/supabase/empty-bucket";

const ADMIN = {
  username: "admin",
  email: "admin@opallab.co.il",
  password: "123456",
  name: "מנהל מערכת",
  phone: "0500000001",
  role: "ADMIN" as const,
  roles: ["ADMIN"] as const,
};

async function wipeOperationalData() {
  const deleted: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    deleted.inventoryUsage = (await tx.inventoryUsage.deleteMany()).count;
    deleted.payment = (await tx.payment.deleteMany()).count;
    deleted.shipment = (await tx.shipment.deleteMany()).count;
    deleted.orderStatusHistory = (await tx.orderStatusHistory.deleteMany()).count;
    deleted.orderFile = (await tx.orderFile.deleteMany()).count;
    deleted.order = (await tx.order.deleteMany()).count;
    deleted.patient = (await tx.patient.deleteMany()).count;
    deleted.attendanceRecord = (await tx.attendanceRecord.deleteMany()).count;
    deleted.trustedDevice = (await tx.trustedDevice.deleteMany()).count;
    deleted.auditLog = (await tx.auditLog.deleteMany()).count;
    deleted.doctor = (await tx.doctor.deleteMany()).count;
    deleted.courier = (await tx.courier.deleteMany()).count;
    deleted.user = (await tx.user.deleteMany()).count;
  });

  return deleted;
}

async function resolveAdminAuthUserId(): Promise<string | null> {
  try {
    return await createAuthUser(ADMIN.email, ADMIN.password);
  } catch {
    /* may already exist */
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === ADMIN.email.toLowerCase(),
    );
    if (!found) return null;
    await updateAuthUser(found.id, {
      email: ADMIN.email,
      password: ADMIN.password,
    });
    return found.id;
  } catch (err) {
    console.warn("[reset-admin-only] auth resolve skipped:", err);
    return null;
  }
}

async function ensureAdmin() {
  const passwordHash = await bcrypt.hash(ADMIN.password, 12);
  const authUserId = await resolveAdminAuthUserId();

  return prisma.user.create({
    data: {
      username: ADMIN.username,
      email: ADMIN.email,
      password: passwordHash,
      name: ADMIN.name,
      phone: ADMIN.phone,
      role: ADMIN.role,
      roles: [...ADMIN.roles],
      authUserId,
      isActive: true,
      color: "#64748b",
    },
  });
}

async function main() {
  console.log("=== OPAL LAB — Reset to admin only ===\n");

  const existing = await prisma.user.findMany({
    select: { id: true, username: true, authUserId: true },
  });

  console.log(`Users before: ${existing.length}`);
  console.log("Deleting orders, shipments, attendance, users...");

  const deleted = await wipeOperationalData();

  for (const user of existing) {
    if (user.authUserId) {
      try {
        await deleteAuthUser(user.authUserId);
      } catch (err) {
        console.warn("[reset-admin-only] auth delete skipped:", user.username, err);
      }
    }
  }

  let storageRemoved: Record<string, number> = {};
  try {
    storageRemoved = await emptyOperationalStorage();
  } catch (err) {
    console.warn("[reset-admin-only] storage cleanup skipped:", err);
  }

  console.log("Creating admin...");
  const admin = await ensureAdmin();

  const counts = {
    users: await prisma.user.count(),
    orders: await prisma.order.count(),
    shipments: await prisma.shipment.count(),
    attendance: await prisma.attendanceRecord.count(),
    doctors: await prisma.doctor.count(),
    patients: await prisma.patient.count(),
    trustedDevices: await prisma.trustedDevice.count(),
  };

  console.log("\nDeleted:", deleted);
  console.log("Storage removed:", storageRemoved);
  console.log("Post-reset counts:", counts);
  console.log("\n✓ Done.");
  console.log(`Login: ${admin.username} / ${ADMIN.password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
