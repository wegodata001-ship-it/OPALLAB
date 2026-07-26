import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/mappers/prisma-to-app";
import type { UserRole } from "@prisma/client";

/**
 * Upsert lab production staff per OPAL LAB department assignments.
 * Default password for new users: 1234
 */
const STAFF: Array<{
  username: string;
  name: string;
  email: string;
  roles: UserRole[];
  nfcTagId: string;
}> = [
  {
    username: "wasim",
    name: "וסים אבו ריה",
    email: "wasim@opallab.local",
    roles: ["DESIGNER"],
    nfcTagId: "NFC-WASIM",
  },
  {
    username: "lian.asud",
    name: "ליאן אסוד",
    email: "lian.asud@opallab.local",
    roles: ["PRINTER", "MILLING"],
    nfcTagId: "NFC-LIAN-ASUD",
  },
  {
    username: "lian.halaila",
    name: "ליאן חלאילה",
    email: "lian.halaila@opallab.local",
    roles: ["PROCESSING", "FINISH"],
    nfcTagId: "NFC-LIAN-HALAILA",
  },
  {
    username: "diana",
    name: "דיאנה",
    email: "diana@opallab.local",
    roles: ["PACKAGING", "SECRETARY"],
    nfcTagId: "NFC-DIANA",
  },
];

async function main() {
  const password = await hashPassword("1234");
  console.log("=== Upserting lab staff ===\n");

  for (const s of STAFF) {
    const primary = s.roles.includes("SECRETARY")
      ? "SECRETARY"
      : s.roles[0]!;

    const existing = await prisma.user.findUnique({ where: { username: s.username } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: s.name,
          email: s.email,
          role: primary,
          roles: s.roles,
          nfcTagId: s.nfcTagId,
          isActive: true,
        },
      });
      console.log(`Updated: ${s.name} (${s.username}) → ${s.roles.join("+")} · ${s.nfcTagId}`);
    } else {
      await prisma.user.create({
        data: {
          username: s.username,
          password,
          name: s.name,
          email: s.email,
          role: primary,
          roles: s.roles,
          nfcTagId: s.nfcTagId,
          isActive: true,
        },
      });
      console.log(`Created: ${s.name} (${s.username}) → ${s.roles.join("+")} · ${s.nfcTagId}`);
    }
  }

  console.log("\nDone. Default password: 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
