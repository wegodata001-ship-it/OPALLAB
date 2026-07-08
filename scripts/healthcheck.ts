import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const REQUIRED_BUCKETS = ["order-files", "inventory-images", "users"];

let failures = 0;
const ok = (m: string) => console.log(`  [OK]   ${m}`);
const bad = (m: string) => {
  console.log(`  [FAIL] ${m}`);
  failures++;
};
const warn = (m: string) => console.log(`  [WARN] ${m}`);

async function main() {
  console.log("\n=== OPAL LAB — DATA connectivity check ===\n");

  console.log("1) Environment variables");
  for (const key of REQUIRED_ENV) {
    if (process.env[key] && process.env[key]!.trim()) ok(key);
    else bad(`${key} is missing`);
  }
  if (!process.env.NEXTAUTH_SECRET?.trim()) {
    warn("NEXTAUTH_SECRET is empty — falling back to service role key for sessions");
  } else {
    ok("NEXTAUTH_SECRET");
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/rest\/v1\/?$/, "");

  console.log("\n2) PostgreSQL connection (Prisma + pooler)");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok("Connected to Supabase Postgres via pooled connection");
  } catch (e) {
    bad(`Postgres connection failed: ${(e as Error).message}`);
  }

  console.log("\n3) Tables & row counts");
  try {
    const counts = {
      users: await prisma.user.count(),
      doctors: await prisma.doctor.count(),
      patients: await prisma.patient.count(),
      orders: await prisma.order.count(),
      orderFiles: await prisma.orderFile.count(),
      inventoryItems: await prisma.inventoryItem.count(),
      inventoryCategories: await prisma.inventoryCategory.count(),
      couriers: await prisma.courier.count(),
      payments: await prisma.payment.count(),
      shipments: await prisma.shipment.count(),
      attendance: await prisma.attendanceRecord.count(),
      labSettings: await prisma.labSettings.count(),
    };
    for (const [table, count] of Object.entries(counts)) {
      ok(`${table}: ${count} rows`);
    }
    if (counts.users === 0) bad("No users found — run: npm run db:seed");
    if (counts.inventoryCategories === 0) warn("No inventory categories — run: npm run db:seed");
    if (counts.labSettings === 0) warn("No lab settings — run: npm run db:seed");
  } catch (e) {
    bad(`Table query failed (migrations applied?): ${(e as Error).message}`);
  }

  console.log("\n4) Write/read/delete round-trip");
  try {
    const probe = await prisma.labSettings.upsert({
      where: { key: "__healthcheck__" },
      update: { value: new Date().toISOString() },
      create: { key: "__healthcheck__", value: new Date().toISOString() },
    });
    const read = await prisma.labSettings.findUnique({ where: { key: "__healthcheck__" } });
    if (read?.value === probe.value) ok("Write + read verified");
    else bad("Read value mismatch");
    await prisma.labSettings.delete({ where: { key: "__healthcheck__" } });
    ok("Delete verified");
  } catch (e) {
    bad(`Round-trip failed: ${(e as Error).message}`);
  }

  console.log("\n5) Supabase Storage buckets");
  try {
    const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      bad(`Cannot list buckets: ${error.message}`);
    } else {
      const names = data.map((b) => b.name);
      for (const bucket of REQUIRED_BUCKETS) {
        if (names.includes(bucket)) ok(`bucket "${bucket}" exists`);
        else bad(`bucket "${bucket}" is missing — create it in Supabase Storage`);
      }
    }
  } catch (e) {
    bad(`Storage check failed: ${(e as Error).message}`);
  }

  await prisma.$disconnect();
  await pool.end();

  console.log("\n=== Result ===");
  if (failures === 0) console.log("ALL CHECKS PASSED — system is connected to DATA.\n");
  else console.log(`${failures} check(s) FAILED — see above.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Healthcheck crashed:", e);
  process.exit(1);
});
