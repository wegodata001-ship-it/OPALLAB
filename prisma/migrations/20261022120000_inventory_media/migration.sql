CREATE TABLE "InventoryImage" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityKind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryScanCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityKind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryScanCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryScanCode_code_key" ON "InventoryScanCode"("code");
CREATE UNIQUE INDEX "InventoryScanCode_module_entityKind_entityId_key" ON "InventoryScanCode"("module", "entityKind", "entityId");
CREATE UNIQUE INDEX "InventoryImage_one_primary" ON "InventoryImage"("module", "entityKind", "entityId") WHERE "isPrimary" = true;
CREATE INDEX "InventoryImage_module_entityId_idx" ON "InventoryImage"("module", "entityId");
CREATE INDEX "InventoryImage_entityId_isPrimary_idx" ON "InventoryImage"("entityId", "isPrimary");
CREATE INDEX "InventoryScanCode_module_entityId_idx" ON "InventoryScanCode"("module", "entityId");

ALTER TABLE "InventoryImage" ADD CONSTRAINT "InventoryImage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImage" ADD CONSTRAINT "InventoryImage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryScanCode" ADD CONSTRAINT "InventoryScanCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryScanCode" ADD CONSTRAINT "InventoryScanCode_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
