-- BMMA catalog and stock. Does not alter existing inventory items, zirconia, titanium, or orders.

CREATE TYPE "BmmaStockAction" AS ENUM ('IN', 'OUT', 'SET');

CREATE TABLE "BmmaCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BmmaCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BmmaModel" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BmmaModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BmmaColor" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "modelId" TEXT,
    "name" TEXT NOT NULL,
    "colorCode" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BmmaColor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BmmaHeight" (
    "id" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BmmaHeight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BmmaMovement" (
    "id" TEXT NOT NULL,
    "heightId" TEXT NOT NULL,
    "action" "BmmaStockAction" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BmmaMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BmmaModel_categoryId_sortOrder_idx" ON "BmmaModel"("categoryId", "sortOrder");
CREATE INDEX "BmmaColor_categoryId_modelId_sortOrder_idx" ON "BmmaColor"("categoryId", "modelId", "sortOrder");
CREATE INDEX "BmmaHeight_colorId_sortOrder_idx" ON "BmmaHeight"("colorId", "sortOrder");
CREATE INDEX "BmmaMovement_heightId_createdAt_idx" ON "BmmaMovement"("heightId", "createdAt");

CREATE UNIQUE INDEX "BmmaModel_active_name_key" ON "BmmaModel"("categoryId", "name") WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "BmmaColor_direct_name_key" ON "BmmaColor"("categoryId", "name") WHERE "modelId" IS NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "BmmaColor_model_name_key" ON "BmmaColor"("modelId", "name") WHERE "modelId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "BmmaHeight_active_label_key" ON "BmmaHeight"("colorId", "label") WHERE "archivedAt" IS NULL;

ALTER TABLE "BmmaModel" ADD CONSTRAINT "BmmaModel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BmmaCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BmmaColor" ADD CONSTRAINT "BmmaColor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BmmaCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BmmaColor" ADD CONSTRAINT "BmmaColor_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BmmaModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BmmaHeight" ADD CONSTRAINT "BmmaHeight_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "BmmaColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BmmaMovement" ADD CONSTRAINT "BmmaMovement_heightId_fkey" FOREIGN KEY ("heightId") REFERENCES "BmmaHeight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BmmaMovement" ADD CONSTRAINT "BmmaMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "BmmaCategory" ("id", "name", "createdAt", "updatedAt")
VALUES ('seed_bmma_category', 'BMMA', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
