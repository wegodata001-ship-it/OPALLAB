import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/** Bump when Prisma schema / migrations change — invalidates cached dev client. */
const PRISMA_SCHEMA_GENERATION = 18;

type PrismaGlobal = {
  prisma?: PrismaClient;
  pool?: Pool;
  schemaGeneration?: number;
};

const globalStore = globalThis as typeof globalThis & { __opalPrisma?: PrismaGlobal };

function getStore(): PrismaGlobal {
  if (!globalStore.__opalPrisma) {
    globalStore.__opalPrisma = {};
  }
  return globalStore.__opalPrisma;
}

function createPrismaClient(store: PrismaGlobal): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pool = store.pool ?? new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  if (process.env.NODE_ENV !== "production") {
    store.pool = pool;
  }

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  const store = getStore();

  if (process.env.NODE_ENV !== "production") {
    if (store.schemaGeneration !== PRISMA_SCHEMA_GENERATION && store.prisma) {
      void store.prisma.$disconnect();
      store.prisma = undefined;
      store.pool = undefined;
    }
    store.schemaGeneration = PRISMA_SCHEMA_GENERATION;
  }

  if (!store.prisma) {
    store.prisma = createPrismaClient(store);
  }

  return store.prisma;
}

export const prisma = getPrismaClient();
