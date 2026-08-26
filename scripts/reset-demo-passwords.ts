/**
 * One-off: reset known demo passwords so local login works.
 * Run: npx tsx scripts/reset-demo-passwords.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword, verifyPassword } from "../src/lib/mappers/prisma-to-app";

const PASSWORD = "1234";

const TARGETS: Array<{ username: string; note: string }> = [
  { username: "admin", note: "מנהל" },
  { username: "ameer.kh", note: "מנהל" },
  { username: "aisha.as", note: "עובדת אריזה (קרוב למזכירות)" },
  { username: "diana.gh", note: "עובדת אריזה" },
  { username: "waseem.ar", note: "עובד / מעצב" },
  { username: "lian.kh", note: "עובדת עיבוד" },
  { username: "dr.omar", note: "רופא" },
  { username: "drhamad", note: "רופא" },
];

async function main() {
  const hash = await hashPassword(PASSWORD);
  console.log("Resetting passwords to:", PASSWORD);

  for (const t of TARGETS) {
    const user = await prisma.user.findFirst({ where: { username: t.username } });
    if (!user) {
      console.log(`SKIP missing: ${t.username}`);
      continue;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash, isActive: true },
    });
    const ok = await verifyPassword(PASSWORD, hash);
    console.log(`OK ${t.username} (${t.note}) verify=${ok} roles=${user.roles.join("+") || user.role}`);
  }

  // Ensure one SECRETARY for calendar tests
  const secretary = await prisma.user.findFirst({
    where: { username: "aisha.as" },
  });
  if (secretary) {
    const roles = Array.from(new Set([...(secretary.roles ?? []), "SECRETARY", "PACKAGING"] as const));
    await prisma.user.update({
      where: { id: secretary.id },
      data: { role: "SECRETARY", roles: roles as ("SECRETARY" | "PACKAGING")[] },
    });
    console.log("Set aisha.as primary role → SECRETARY (kept PACKAGING)");
  }

  console.log("\nLogin with password:", PASSWORD);
  console.log("  מזכירה: aisha.as");
  console.log("  רופא:    dr.omar");
  console.log("  עובד:    waseem.ar");
  console.log("  מנהל:    admin");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
