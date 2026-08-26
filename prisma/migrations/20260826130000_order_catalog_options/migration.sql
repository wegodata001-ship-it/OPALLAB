-- Convert order material/work enum arrays to text arrays (admin-extensible catalog).
ALTER TABLE "Order" ALTER COLUMN "materials" TYPE TEXT[] USING ("materials"::text[]);
ALTER TABLE "Order" ALTER COLUMN "workTypes" TYPE TEXT[] USING ("workTypes"::text[]);

CREATE TYPE "OrderCatalogCategory" AS ENUM ('MATERIAL', 'WORK_TYPE', 'SHADE');

CREATE TABLE "OrderCatalogOption" (
    "id" TEXT NOT NULL,
    "category" "OrderCatalogCategory" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "group" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderCatalogOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderCatalogOption_category_code_key" ON "OrderCatalogOption"("category", "code");
CREATE INDEX "OrderCatalogOption_category_isActive_sortOrder_idx" ON "OrderCatalogOption"("category", "isActive", "sortOrder");
