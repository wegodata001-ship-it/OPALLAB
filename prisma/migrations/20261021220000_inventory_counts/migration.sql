-- Inventory counting sessions. Does not delete stock, reset quantities, or change orders.

ALTER TYPE "BmmaStockAction" ADD VALUE 'COUNT';
ALTER TYPE "SimpleStockAction" ADD VALUE 'COUNT';
ALTER TYPE "ImplantStockAction" ADD VALUE 'COUNT';
ALTER TYPE "DoctorPartMovementType" ADD VALUE 'STOCK_COUNT';

CREATE TYPE "InventoryModuleType" AS ENUM ('ZIRCONIA', 'TITANIUM', 'BMMA', 'DRILLS', 'IMPLANTS', 'CLINIC_MATERIALS', 'OTHER_MATERIALS', 'DOCTOR_PARTS');
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');
CREATE TYPE "DrillStockAction" AS ENUM ('IN', 'OUT', 'SET', 'COUNT');
CREATE TYPE "TitaniumStockAction" AS ENUM ('IN', 'OUT', 'SET', 'COUNT');

ALTER TABLE "ZirconiaStockMovement" ADD COLUMN "countId" TEXT;
ALTER TABLE "BmmaMovement" ADD COLUMN "countId" TEXT;
ALTER TABLE "SimpleStockMovement" ADD COLUMN "countId" TEXT;
ALTER TABLE "ImplantStockMovement" ADD COLUMN "countId" TEXT;
ALTER TABLE "DoctorPartMovement" ADD COLUMN "countId" TEXT;
ALTER TABLE "TitaniumSize" ADD COLUMN "quantity" INTEGER;

CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "inventoryType" "InventoryModuleType" NOT NULL,
    "serial" INTEGER NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT NOT NULL DEFAULT '',
    "counterName" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "countedItems" INTEGER NOT NULL DEFAULT 0,
    "changedItems" INTEGER NOT NULL DEFAULT 0,
    "unchangedItems" INTEGER NOT NULL DEFAULT 0,
    "differenceTotal" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modelName" TEXT NOT NULL DEFAULT '',
    "kindName" TEXT NOT NULL DEFAULT '',
    "colorName" TEXT NOT NULL DEFAULT '',
    "sizeName" TEXT NOT NULL DEFAULT '',
    "barcode" TEXT NOT NULL DEFAULT '',
    "quantityAtStart" INTEGER,
    "countedQuantity" INTEGER,
    "quantityBeforeApproval" INTEGER,
    "difference" INTEGER,
    "quantityAfter" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TitaniumStockMovement" (
    "id" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "action" "TitaniumStockAction" NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "countId" TEXT,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TitaniumStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrillMachine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DrillMachine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrillType" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DrillType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrillBit" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DrillBit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DrillStockMovement" (
    "id" TEXT NOT NULL,
    "bitId" TEXT NOT NULL,
    "action" "DrillStockAction" NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "countId" TEXT,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrillStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryCount_inventoryType_serial_key" ON "InventoryCount"("inventoryType", "serial");
CREATE INDEX "InventoryCount_inventoryType_status_createdAt_idx" ON "InventoryCount"("inventoryType", "status", "createdAt");
CREATE UNIQUE INDEX "InventoryCountLine_countId_itemId_key" ON "InventoryCountLine"("countId", "itemId");
CREATE INDEX "InventoryCountLine_countId_idx" ON "InventoryCountLine"("countId");
CREATE INDEX "TitaniumStockMovement_sizeId_createdAt_idx" ON "TitaniumStockMovement"("sizeId", "createdAt");
CREATE INDEX "DrillMachine_sortOrder_idx" ON "DrillMachine"("sortOrder");
CREATE INDEX "DrillType_machineId_sortOrder_idx" ON "DrillType"("machineId", "sortOrder");
CREATE INDEX "DrillBit_typeId_sortOrder_idx" ON "DrillBit"("typeId", "sortOrder");
CREATE INDEX "DrillStockMovement_bitId_createdAt_idx" ON "DrillStockMovement"("bitId", "createdAt");

ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitaniumStockMovement" ADD CONSTRAINT "TitaniumStockMovement_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "TitaniumSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitaniumStockMovement" ADD CONSTRAINT "TitaniumStockMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrillType" ADD CONSTRAINT "DrillType_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "DrillMachine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrillBit" ADD CONSTRAINT "DrillBit_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "DrillType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrillStockMovement" ADD CONSTRAINT "DrillStockMovement_bitId_fkey" FOREIGN KEY ("bitId") REFERENCES "DrillBit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrillStockMovement" ADD CONSTRAINT "DrillStockMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
