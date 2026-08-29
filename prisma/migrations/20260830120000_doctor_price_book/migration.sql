-- Billable SKUs for doctor price books + order price line snapshots.
DO $$ BEGIN
  ALTER TYPE "OrderCatalogCategory" ADD VALUE 'BILLABLE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "priceLines" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "DoctorPrice" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "catalogOptionId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DoctorPrice_doctorId_catalogOptionId_key"
  ON "DoctorPrice"("doctorId", "catalogOptionId");
CREATE INDEX IF NOT EXISTS "DoctorPrice_doctorId_isActive_idx"
  ON "DoctorPrice"("doctorId", "isActive");
CREATE INDEX IF NOT EXISTS "DoctorPrice_catalogOptionId_idx"
  ON "DoctorPrice"("catalogOptionId");

DO $$ BEGIN
  ALTER TABLE "DoctorPrice"
    ADD CONSTRAINT "DoctorPrice_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DoctorPrice"
    ADD CONSTRAINT "DoctorPrice_catalogOptionId_fkey"
    FOREIGN KEY ("catalogOptionId") REFERENCES "OrderCatalogOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
