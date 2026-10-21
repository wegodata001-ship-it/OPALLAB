-- Implant catalog. Does not alter BMMA, zirconia, titanium, simple stock, classic inventory, orders, or customers.
-- Seeds MLS, M4, MIS, and STAND/WIDE/NARU under M4 only. No sample heights or quantities.

CREATE TYPE "ImplantStockAction" AS ENUM ('IN', 'OUT', 'SET');

CREATE TABLE "ImplantBrand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImplantBrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImplantModel" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImplantModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImplantType" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImplantType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImplantHeight" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImplantHeight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImplantStockMovement" (
    "id" TEXT NOT NULL,
    "heightId" TEXT NOT NULL,
    "action" "ImplantStockAction" NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImplantStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImplantBrand_sortOrder_idx" ON "ImplantBrand"("sortOrder");
CREATE INDEX "ImplantModel_brandId_sortOrder_idx" ON "ImplantModel"("brandId", "sortOrder");
CREATE INDEX "ImplantType_modelId_sortOrder_idx" ON "ImplantType"("modelId", "sortOrder");
CREATE INDEX "ImplantHeight_typeId_sortOrder_idx" ON "ImplantHeight"("typeId", "sortOrder");
CREATE INDEX "ImplantStockMovement_heightId_createdAt_idx" ON "ImplantStockMovement"("heightId", "createdAt");

CREATE UNIQUE INDEX "ImplantBrand_active_name_key" ON "ImplantBrand"("name") WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ImplantModel_active_name_key" ON "ImplantModel"("brandId", "name") WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ImplantType_active_name_key" ON "ImplantType"("modelId", "name") WHERE "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ImplantHeight_active_label_key" ON "ImplantHeight"("typeId", "label") WHERE "archivedAt" IS NULL;

ALTER TABLE "ImplantModel" ADD CONSTRAINT "ImplantModel_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "ImplantBrand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImplantType" ADD CONSTRAINT "ImplantType_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ImplantModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImplantHeight" ADD CONSTRAINT "ImplantHeight_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ImplantType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImplantStockMovement" ADD CONSTRAINT "ImplantStockMovement_heightId_fkey" FOREIGN KEY ("heightId") REFERENCES "ImplantHeight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImplantStockMovement" ADD CONSTRAINT "ImplantStockMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ImplantBrand" ("id", "name", "sortOrder", "createdAt", "updatedAt")
VALUES ('seed_implant_brand_mls', 'MLS', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ImplantModel" ("id", "brandId", "name", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('seed_implant_model_m4', 'seed_implant_brand_mls', 'M4', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('seed_implant_model_mis', 'seed_implant_brand_mls', 'MIS', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ImplantType" ("id", "modelId", "name", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('seed_implant_type_m4_stand', 'seed_implant_model_m4', 'STAND', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('seed_implant_type_m4_wide', 'seed_implant_model_m4', 'WIDE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('seed_implant_type_m4_naru', 'seed_implant_model_m4', 'NARU', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
