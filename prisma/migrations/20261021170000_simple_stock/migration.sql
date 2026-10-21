-- Free-form clinic materials and miscellaneous materials.
-- Does not alter BMMA, zirconia, titanium, classic inventory, orders, or customers.

CREATE TYPE "SimpleStockKind" AS ENUM ('CLINIC_MATERIALS', 'OTHER_MATERIALS');
CREATE TYPE "SimpleStockAction" AS ENUM ('IN', 'OUT', 'SET');

CREATE TABLE "SimpleStockItem" (
    "id" TEXT NOT NULL,
    "kind" "SimpleStockKind" NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SimpleStockItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SimpleStockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "action" "SimpleStockAction" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimpleStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SimpleStockItem_kind_archivedAt_name_idx" ON "SimpleStockItem"("kind", "archivedAt", "name");
CREATE INDEX "SimpleStockMovement_itemId_createdAt_idx" ON "SimpleStockMovement"("itemId", "createdAt");

ALTER TABLE "SimpleStockMovement" ADD CONSTRAINT "SimpleStockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "SimpleStockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimpleStockMovement" ADD CONSTRAINT "SimpleStockMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
