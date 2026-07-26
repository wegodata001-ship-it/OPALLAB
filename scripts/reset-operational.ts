/**
 * Client-handover reset: orders + shipments + attendance only.
 * Usage: npm run db:reset-operational
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ResetSystemService } from "../src/lib/system/reset-system.service";

async function main() {
  const actor =
    (await prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ role: "OWNER" }, { roles: { has: "OWNER" } }],
      },
      select: { id: true, username: true, name: true, role: true },
    })) ??
    (await prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ role: "ADMIN" }, { roles: { has: "ADMIN" } }, { username: "admin" }],
      },
      select: { id: true, username: true, name: true, role: true },
    }));

  if (!actor) {
    throw new Error("לא נמצא משתמש Owner/Admin פעיל לרישום ה-Audit");
  }

  console.log(`Running operational reset as ${actor.username} (${actor.name})...`);
  const result = await ResetSystemService.execute({
    actorUserId: actor.id,
    reason: "Client handover reset",
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
