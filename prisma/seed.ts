import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

const defaultLabSettings = {
  allowedWifiSsids: ["OPAL-LAB", "OPAL_WIFI"],
  wifiAttendanceEnabled: true,
  requireGeofence: true,
  attendanceCode: "opal1234",
};

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

  const labEntries = [
    { key: "allowedWifiSsids", value: JSON.stringify(defaultLabSettings.allowedWifiSsids) },
    { key: "wifiAttendanceEnabled", value: String(defaultLabSettings.wifiAttendanceEnabled) },
    { key: "requireGeofence", value: String(defaultLabSettings.requireGeofence) },
    { key: "attendanceCode", value: defaultLabSettings.attendanceCode },
  ];

  for (const entry of labEntries) {
    await prisma.labSettings.upsert({
      where: { key: entry.key },
      update: { value: entry.value },
      create: entry,
    });
  }

  console.log(`Bootstrap complete. Admin user: ${admin.username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
