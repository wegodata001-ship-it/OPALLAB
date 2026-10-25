-- Drill number stays a DrillBit row. This only records who last changed it
-- and blocks two active numbers with the same name inside one material.
ALTER TABLE "DrillBit" ADD COLUMN "updatedById" TEXT;

UPDATE "DrillBit" AS bit
SET "updatedById" = latest."performedBy"
FROM (
  SELECT DISTINCT ON ("bitId") "bitId", "performedBy"
  FROM "DrillStockMovement"
  ORDER BY "bitId", "createdAt" DESC
) AS latest
WHERE bit.id = latest."bitId"
  AND bit."updatedById" IS NULL;

ALTER TABLE "DrillBit"
  ADD CONSTRAINT "DrillBit_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "DrillBit_updatedById_idx" ON "DrillBit"("updatedById");

CREATE UNIQUE INDEX "DrillBit_type_label_active"
  ON "DrillBit" ("typeId", lower("label"))
  WHERE "archivedAt" IS NULL;
