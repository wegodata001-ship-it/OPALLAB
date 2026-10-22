-- Zirconia sub-models. Does not delete models, colors, heights, quantities, or other inventory.
-- Promotes the existing AM attributes LU and ZOLG into sub-models once.
-- Leaves colors and heights that have no sub-model unassigned.

CREATE TABLE "ZirconiaVariant" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "sourceAttributeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ZirconiaVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZirconiaVariant_sourceAttributeId_key" ON "ZirconiaVariant"("sourceAttributeId");
CREATE INDEX "ZirconiaVariant_modelId_sortOrder_idx" ON "ZirconiaVariant"("modelId", "sortOrder");
CREATE UNIQUE INDEX "ZirconiaVariant_model_name_active" ON "ZirconiaVariant"("modelId", "name") WHERE "archivedAt" IS NULL;

ALTER TABLE "ZirconiaVariant" ADD CONSTRAINT "ZirconiaVariant_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ZirconiaModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ZirconiaVariant" ("id", "modelId", "name", "sortOrder", "sourceAttributeId", "createdAt", "updatedAt")
SELECT a."id", a."modelId", a."name", a."sortOrder", a."id", a."createdAt", a."updatedAt"
FROM "ZirconiaAttribute" a
JOIN "ZirconiaModel" m ON m."id" = a."modelId"
WHERE m."name" = 'AM' AND a."name" IN ('LU', 'ZOLG')
AND NOT EXISTS (
    SELECT 1 FROM "ZirconiaVariant" v
    WHERE v."modelId" = a."modelId" AND v."name" = a."name" AND v."archivedAt" IS NULL
)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "ZirconiaColor" ADD COLUMN "variantId" TEXT;
ALTER TABLE "ZirconiaColor" ADD CONSTRAINT "ZirconiaColor_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ZirconiaVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "ZirconiaColor_modelId_name_key";
CREATE UNIQUE INDEX "ZirconiaColor_variant_name_active" ON "ZirconiaColor"("variantId", "name") WHERE "variantId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ZirconiaColor_legacy_name_active" ON "ZirconiaColor"("modelId", "name") WHERE "variantId" IS NULL AND "archivedAt" IS NULL;
CREATE INDEX "ZirconiaColor_variantId_sortOrder_idx" ON "ZirconiaColor"("variantId", "sortOrder");

ALTER TABLE "ZirconiaHeight" ADD COLUMN "colorId" TEXT;
ALTER TABLE "ZirconiaHeight" ADD COLUMN "quantity" INTEGER;
ALTER TABLE "ZirconiaHeight" ADD COLUMN "minQuantity" INTEGER;
ALTER TABLE "ZirconiaHeight" ADD CONSTRAINT "ZirconiaHeight_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "ZirconiaColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "ZirconiaHeight_modelId_label_key";
CREATE UNIQUE INDEX "ZirconiaHeight_color_label_active" ON "ZirconiaHeight"("colorId", "label") WHERE "colorId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ZirconiaHeight_legacy_label_active" ON "ZirconiaHeight"("modelId", "label") WHERE "colorId" IS NULL AND "archivedAt" IS NULL;
CREATE INDEX "ZirconiaHeight_colorId_sortOrder_idx" ON "ZirconiaHeight"("colorId", "sortOrder");

ALTER TABLE "ZirconiaStockMovement" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "ZirconiaStockMovement" ADD COLUMN "heightId" TEXT;
ALTER TABLE "ZirconiaStockMovement" ADD CONSTRAINT "ZirconiaStockMovement_heightId_fkey" FOREIGN KEY ("heightId") REFERENCES "ZirconiaHeight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ZirconiaStockMovement_heightId_createdAt_idx" ON "ZirconiaStockMovement"("heightId", "createdAt");
