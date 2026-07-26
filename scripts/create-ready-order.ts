/**
 * Creates a demo order at FINISH status — ready for delivery note on /shipping
 * Run: npx tsx scripts/create-ready-order.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

function serial() {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const r = Math.floor(Math.random() * 900 + 100);
  return `OL-${y}${m}${day}-${r}`;
}

async function main() {
  const admin =
    (await prisma.user.findFirst({ where: { username: "admin" } })) ??
    (await prisma.user.findFirst({ where: { OR: [{ role: "ADMIN" }, { roles: { has: "ADMIN" } }] } }));
  if (!admin) throw new Error("No admin user found");

  const doctor =
    (await prisma.doctor.findFirst({
      where: { user: { username: "doctor" }, isActive: true },
      include: { user: true },
    })) ??
    (await prisma.doctor.findFirst({ where: { isActive: true } }));
  if (!doctor) throw new Error("No doctor found");

  const patient = await prisma.patient.create({
    data: {
      name: "מטופל לבדיקת משלוח",
      age: 42,
      gender: "MALE",
    },
  });

  const serialNumber = serial();
  const order = await prisma.order.create({
    data: {
      serialNumber,
      doctorId: doctor.id,
      patientId: patient.id,
      shade: "A2",
      materials: ["ZIRCONIA"],
      workTypes: ["SCREWED"],
      selectedTeeth: [11, 21],
      description: "הזמנת בדיקה להפקת תעודת משלוח",
      totalPrice: 450,
      status: "FINISH",
      notes: "מוכנה לשילוח",
    },
  });

  await prisma.orderStatusHistory.createMany({
    data: [
      { orderId: order.id, status: "RECEIVED", changedBy: admin.id, notes: "הזמנה חדשה" },
      { orderId: order.id, status: "DESIGN", changedBy: admin.id, notes: "עיצוב הושלם" },
      { orderId: order.id, status: "PRINTING_3D", changedBy: admin.id, notes: "הדפסה" },
      { orderId: order.id, status: "MILLING", changedBy: admin.id, notes: "חריטה" },
      { orderId: order.id, status: "PROCESSING", changedBy: admin.id, notes: "עיבוד" },
      { orderId: order.id, status: "FINISH", changedBy: admin.id, notes: "גימור — מוכנה לשילוח" },
    ],
  });

  await prisma.payment.create({
    data: {
      doctorId: doctor.id,
      orderId: order.id,
      serialNumber: order.serialNumber,
      patientName: patient.name,
      amount: 450,
      type: "CHARGE",
      status: "PENDING",
      description: `חיוב עבודה ${order.serialNumber}`,
    },
  });

  console.log("\n✅ הזמנה מוכנה לתעודת משלוח");
  console.log(`   מספר: ${order.serialNumber}`);
  console.log(`   רופא: ${doctor.name}`);
  console.log(`   מטופל: ${patient.name}`);
  console.log(`   סטטוס: FINISH`);
  console.log(`   מזהה: ${order.id}`);
  console.log("\n→ היכנס ל־/shipping ובחר את ההזמנה\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
