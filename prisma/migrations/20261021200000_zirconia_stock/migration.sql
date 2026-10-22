-- Zirconia stock items. Does not delete models, attributes, values, orders, or other inventory.
-- Copies already saved color and length values into the stock lists. Does not invent products or quantities.

CREATE TYPE "ZirconiaStockAction" AS ENUM ('IN', 'OUT', 'SET', 'COUNT');

CREATE TABLE "ZirconiaColor" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ZirconiaColor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZirconiaHeight" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ZirconiaHeight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZirconiaProduct" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "heightId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ZirconiaProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZirconiaStockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "action" "ZirconiaStockAction" NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZirconiaStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ZirconiaColor_modelId_name_key" ON "ZirconiaColor"("modelId", "name");
CREATE INDEX "ZirconiaColor_modelId_sortOrder_idx" ON "ZirconiaColor"("modelId", "sortOrder");
CREATE UNIQUE INDEX "ZirconiaHeight_modelId_label_key" ON "ZirconiaHeight"("modelId", "label");
CREATE INDEX "ZirconiaHeight_modelId_sortOrder_idx" ON "ZirconiaHeight"("modelId", "sortOrder");
CREATE UNIQUE INDEX "ZirconiaProduct_colorId_heightId_key" ON "ZirconiaProduct"("colorId", "heightId");
CREATE INDEX "ZirconiaProduct_modelId_archivedAt_idx" ON "ZirconiaProduct"("modelId", "archivedAt");
CREATE INDEX "ZirconiaStockMovement_productId_createdAt_idx" ON "ZirconiaStockMovement"("productId", "createdAt");

ALTER TABLE "ZirconiaColor" ADD CONSTRAINT "ZirconiaColor_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ZirconiaModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZirconiaHeight" ADD CONSTRAINT "ZirconiaHeight_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ZirconiaModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZirconiaProduct" ADD CONSTRAINT "ZirconiaProduct_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ZirconiaModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZirconiaProduct" ADD CONSTRAINT "ZirconiaProduct_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "ZirconiaColor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZirconiaProduct" ADD CONSTRAINT "ZirconiaProduct_heightId_fkey" FOREIGN KEY ("heightId") REFERENCES "ZirconiaHeight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZirconiaStockMovement" ADD CONSTRAINT "ZirconiaStockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ZirconiaProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ZirconiaStockMovement" ADD CONSTRAINT "ZirconiaStockMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ZirconiaColor" ("id", "modelId", "name", "sortOrder", "createdAt", "updatedAt")
SELECT v."id", a."modelId", v."label", v."sortOrder", v."createdAt", v."updatedAt"
FROM "ZirconiaAttributeValue" v
JOIN "ZirconiaAttribute" a ON a."id" = v."attributeId"
WHERE a."name" = 'צבע'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ZirconiaHeight" ("id", "modelId", "label", "sortOrder", "createdAt", "updatedAt")
SELECT v."id", a."modelId", v."label", v."sortOrder", v."createdAt", v."updatedAt"
FROM "ZirconiaAttributeValue" v
JOIN "ZirconiaAttribute" a ON a."id" = v."attributeId"
WHERE a."name" IN ('אורך', 'גובה')
ON CONFLICT ("id") DO NOTHING;
