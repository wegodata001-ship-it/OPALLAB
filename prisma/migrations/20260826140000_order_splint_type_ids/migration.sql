-- Multi-select splint types on orders; backfill from legacy single FK.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "splintTypeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Order"
SET "splintTypeIds" = ARRAY["splintTypeId"]
WHERE "splintTypeId" IS NOT NULL
  AND (cardinality("splintTypeIds") = 0 OR "splintTypeIds" IS NULL);
