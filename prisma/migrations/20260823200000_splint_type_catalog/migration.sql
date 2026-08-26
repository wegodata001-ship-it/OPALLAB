-- CreateTable
CREATE TABLE IF NOT EXISTS "SplintType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SplintType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SplintType_code_key" ON "SplintType"("code");
CREATE INDEX IF NOT EXISTS "SplintType_isActive_sortOrder_idx" ON "SplintType"("isActive", "sortOrder");

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "splintTypeId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_splintTypeId_idx" ON "Order"("splintTypeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_splintTypeId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_splintTypeId_fkey"
      FOREIGN KEY ("splintTypeId") REFERENCES "SplintType"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Seed default catalog (idempotent)
INSERT INTO "SplintType" ("id", "code", "name", "isActive", "sortOrder", "isSystem", "createdAt", "updatedAt")
VALUES
  ('splint_night_guard', 'NIGHT_GUARD', E'🦷 סד לילה', true, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('splint_whitening', 'WHITENING', E'✨ סד הלבנה', true, 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('splint_surgical', 'SURGICAL', E'🛡️ סד חרוט', true, 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('splint_omnivac', 'OMNIVAC', E'🔹 OMNIVAC', true, 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
