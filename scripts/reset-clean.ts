/**
 * מחיקת כל הנתונים והקמת מערכת נקייה עם 3 משתמשים בלבד:
 * מנהל | עובד | רופא
 *
 * הרצה: npx tsx scripts/reset-clean.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { createAuthUser } from "../src/lib/supabase/auth-admin";

const USERS = {
  admin: {
    username: "admin",
    email: "admin@opallab.co.il",
    password: "1234",
    name: "מנהל מערכת",
    role: "ADMIN" as const,
    roles: ["ADMIN"] as const,
    phone: "0500000001",
  },
  employee: {
    username: "opallb20",
    email: "opallb20@gmail.com",
    password: "opallb20@gmail.com",
    name: "עובד מעבדה",
    role: "DESIGNER" as const,
    roles: ["DESIGNER"] as const,
    phone: "0500000002",
  },
  doctor: {
    username: "doctor",
    email: "doctor@opallab.co.il",
    password: "opallb20@gmail.com",
    name: "ד\"ר לדוגמה",
    role: "DOCTOR" as const,
    roles: ["DOCTOR"] as const,
    phone: "0500000003",
    clinic: "מרפאת לדוגמה",
  },
};

async function wipeAllData() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.inventoryMovement.deleteMany(),
    prisma.inventoryUsage.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderFile.deleteMany(),
    prisma.shipment.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.order.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.attendanceRecord.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.doctor.deleteMany(),
    prisma.courier.deleteMany(),
    prisma.user.deleteMany(),
    prisma.warehouse.deleteMany(),
  ]);
}

async function seedMinimalSettings() {
  const categories = [
    { id: "RAW_MATERIALS", name: "חומרי גלם ושוטף", color: "#3b82f6", isSystem: true },
    { id: "PARTS_COMPONENTS", name: "חלקים ורכיבים", color: "#8b5cf6", isSystem: true },
    { id: "OWNER_ASSETS", name: "מלאי בעלים", color: "#c9a227", isSystem: true },
  ];

  for (const category of categories) {
    await prisma.inventoryCategory.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  await prisma.inventoryCategory.deleteMany({ where: { isSystem: false } });

  await prisma.labSettings.deleteMany({
    where: {
      key: { in: ["allowedWifiSsids", "wifiAttendanceEnabled", "requireGeofence", "attendanceCode"] },
    },
  });

  for (const warehouse of [
    { name: "מחסן ראשי", description: "מחסן מרכזי" },
    { name: "חדר הדפסה", description: "מלאי הדפסה 3D" },
    { name: "מחסן CAD", description: "עיצוב ו-CAD" },
  ]) {
    await prisma.warehouse.create({ data: warehouse });
  }
}

async function createUserWithAuth(input: {
  username: string;
  email: string;
  password: string;
  name: string;
  role: (typeof USERS.admin)["role"];
  roles: readonly string[];
  phone: string;
}) {
  let authUserId: string | null = null;
  try {
    authUserId = await createAuthUser(input.email, input.password);
  } catch {
    // Auth user may already exist from prior run
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      password: passwordHash,
      name: input.name,
      phone: input.phone,
      role: input.role,
      roles: [...input.roles],
      authUserId,
      isActive: true,
      color: "#3b82f6",
    },
  });
}

async function main() {
  console.log("מוחק את כל הנתונים...");
  await wipeAllData();

  console.log("מקים הגדרות בסיס...");
  await seedMinimalSettings();

  console.log("יוצר משתמשים...");
  const admin = await createUserWithAuth(USERS.admin);
  const employee = await createUserWithAuth(USERS.employee);
  const doctorUser = await createUserWithAuth(USERS.doctor);

  await prisma.doctor.create({
    data: {
      userId: doctorUser.id,
      name: USERS.doctor.name,
      clinic: USERS.doctor.clinic,
      phone: USERS.doctor.phone,
      email: USERS.doctor.email,
      balance: 0,
      paymentStatus: "PENDING",
      isActive: true,
    },
  });

  console.log("\n✓ המערכת נוקתה והוקמה מחדש.\n");
  console.log("משתמשים:");
  console.log(`  מנהל:  ${admin.username} / ${USERS.admin.password}`);
  console.log(`  עובד:  ${employee.username} / ${USERS.employee.password} (${employee.email})`);
  console.log(`  רופא:  ${doctorUser.username} / ${USERS.doctor.password} (${doctorUser.email})`);
  console.log("\nאין הזמנות, מלאי, תשלומים או רשומות נוספות.");
}

main()
  .catch((error) => {
    console.error("שגיאה:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
