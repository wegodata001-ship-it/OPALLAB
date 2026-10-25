-- Production material usage log. Does not alter stock quantities or inventory movements.

CREATE TYPE "ProductionMaterialStage" AS ENUM ('DESIGN', 'PRINTING_3D');

CREATE TABLE "ProductionMaterialUse" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderSerial" TEXT NOT NULL,
    "stage" "ProductionMaterialStage" NOT NULL,
    "heightId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "heightLabel" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL DEFAULT '',
    "barcode" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "ProductionMaterialUse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionMaterialUseRevision" (
    "id" TEXT NOT NULL,
    "useId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "heightLabel" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionMaterialUseRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionMaterialUse_orderId_stage_idx" ON "ProductionMaterialUse"("orderId", "stage");
CREATE INDEX "ProductionMaterialUse_recordedAt_idx" ON "ProductionMaterialUse"("recordedAt");
CREATE INDEX "ProductionMaterialUse_heightId_idx" ON "ProductionMaterialUse"("heightId");
CREATE INDEX "ProductionMaterialUse_recordedById_idx" ON "ProductionMaterialUse"("recordedById");
CREATE UNIQUE INDEX "ProductionMaterialUse_active_order_stage_height_key" ON "ProductionMaterialUse"("orderId", "stage", "heightId") WHERE "removedAt" IS NULL;
CREATE INDEX "ProductionMaterialUseRevision_useId_createdAt_idx" ON "ProductionMaterialUseRevision"("useId", "createdAt");

ALTER TABLE "ProductionMaterialUse" ADD CONSTRAINT "ProductionMaterialUse_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionMaterialUse" ADD CONSTRAINT "ProductionMaterialUse_heightId_fkey" FOREIGN KEY ("heightId") REFERENCES "ZirconiaHeight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionMaterialUse" ADD CONSTRAINT "ProductionMaterialUse_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionMaterialUseRevision" ADD CONSTRAINT "ProductionMaterialUseRevision_useId_fkey" FOREIGN KEY ("useId") REFERENCES "ProductionMaterialUse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionMaterialUseRevision" ADD CONSTRAINT "ProductionMaterialUseRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
