import "dotenv/config";
import { resetDatabaseToBase } from "../src/lib/db/reset-to-base";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("=== OPAL LAB — Reset to BASE ===\n");
  const result = await resetDatabaseToBase();

  console.log("Protected users kept:");
  for (const u of result.protectedUsers) {
    console.log(`  - ${u.name} (${u.username}) [${u.id}]`);
  }

  console.log("\nDeleted rows:");
  for (const [table, count] of Object.entries(result.deleted)) {
    if (count > 0) console.log(`  ${table}: ${count}`);
  }

  console.log("\nStorage files removed:");
  for (const [bucket, count] of Object.entries(result.storageRemoved)) {
    console.log(`  ${bucket}: ${count}`);
  }

  const counts = {
    users: await prisma.user.count(),
    orders: await prisma.order.count(),
    doctors: await prisma.doctor.count(),
    couriers: await prisma.courier.count(),
    attendance: await prisma.attendanceRecord.count(),
    payments: await prisma.payment.count(),
    inventory: await prisma.inventoryItem.count(),
  };

  console.log("\nPost-reset counts:", counts);
  console.log("\n✓ BASE reset complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
