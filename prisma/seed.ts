import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  const passwordHash = await bcrypt.hash("1234", 12);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: passwordHash,
      email: "admin@opallab.co.il",
      name: "מנהל מערכת",
      phone: "0507890123",
      role: "ADMIN",
      roles: ["ADMIN"],
      nfcTagId: "NFC-ADMIN",
      address: "סחנין",
      color: "#64748b",
      isActive: true,
    },
  });

  const categories = [
    { id: "RAW_MATERIALS", name: "חומרי גלם ושוטף", color: "#3b82f6", isSystem: true },
    { id: "PARTS_COMPONENTS", name: "חלקים ורכיבים", color: "#8b5cf6", isSystem: true },
    { id: "OWNER_ASSETS", name: "מלאי בעלים", color: "#c9a227", isSystem: true },
    { id: "CONSUMABLES", name: "צריכה שוטפת", color: "#10b981", isSystem: false },
  ];

  for (const category of categories) {
    await prisma.inventoryCategory.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  await prisma.labSettings.deleteMany({
    where: {
      key: { in: ["allowedWifiSsids", "wifiAttendanceEnabled", "requireGeofence", "attendanceCode"] },
    },
  });

  const warehouses = [
    { name: "מחסן ראשי", description: "מחסן מרכזי" },
    { name: "חדר הדפסה", description: "מלאי הדפסה 3D" },
    { name: "מחסן CAD", description: "עיצוב ו-CAD" },
  ];

  for (const warehouse of warehouses) {
    await prisma.warehouse.upsert({
      where: { name: warehouse.name },
      update: warehouse,
      create: warehouse,
    });
  }

  await prisma.$executeRawUnsafe(`UPDATE "User" SET roles = ARRAY[role]::"UserRole"[] WHERE cardinality(roles) = 0`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
