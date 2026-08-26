/**
 * Upsert attendance-only assistants: דיאנה גנאים + עאישה אבו סאלח
 * Run: npx tsx scripts/upsert-assistants.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/mappers/prisma-to-app";

const PASSWORD = "1234";

const ASSISTANTS: Array<{
  username: string;
  name: string;
  email: string;
}> = [
  {
    username: "diana.gh",
    name: "דיאנה גנאים",
    email: "diana.gh@opallab.local",
  },
  {
    username: "aisha.as",
    name: "עאישה אבו סאלח",
    email: "aisha.as@opallab.local",
  },
];

async function main() {
  const password = await hashPassword(PASSWORD);
  console.log("Upserting ASSISTANT users (password:", PASSWORD + ")");

  for (const a of ASSISTANTS) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ username: a.username }, { name: a.name }, { email: a.email }],
      },
    });

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          username: a.username,
          name: a.name,
          email: existing.email || a.email,
          password,
          role: "ASSISTANT",
          roles: ["ASSISTANT"],
          isActive: true,
        },
      });
      console.log(`UPDATED ${updated.username} → ASSISTANT (${updated.name}) id=${updated.id}`);
    } else {
      const created = await prisma.user.create({
        data: {
          username: a.username,
          name: a.name,
          email: a.email,
          password,
          role: "ASSISTANT",
          roles: ["ASSISTANT"],
          isActive: true,
        },
      });
      console.log(`CREATED ${created.username} → ASSISTANT (${created.name}) id=${created.id}`);
    }
  }

  console.log("\nLogin:");
  console.log("  דיאנה:  diana.gh /", PASSWORD);
  console.log("  עאישה:  aisha.as /", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
