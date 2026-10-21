-- Titanium catalog only. Does not alter zirconia, inventory items, quantities, or orders.

CREATE TABLE "TitaniumCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "hubSortOrder" INTEGER NOT NULL DEFAULT 6,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TitaniumCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TitaniumModel" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TitaniumModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TitaniumRadius" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TitaniumRadius_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TitaniumSize" (
    "id" TEXT NOT NULL,
    "radiusId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TitaniumSize_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TitaniumModel_categoryId_sortOrder_idx" ON "TitaniumModel"("categoryId", "sortOrder");
CREATE INDEX "TitaniumRadius_modelId_sortOrder_idx" ON "TitaniumRadius"("modelId", "sortOrder");
CREATE INDEX "TitaniumSize_radiusId_sortOrder_idx" ON "TitaniumSize"("radiusId", "sortOrder");

ALTER TABLE "TitaniumModel" ADD CONSTRAINT "TitaniumModel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TitaniumCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitaniumRadius" ADD CONSTRAINT "TitaniumRadius_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "TitaniumModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TitaniumSize" ADD CONSTRAINT "TitaniumSize_radiusId_fkey" FOREIGN KEY ("radiusId") REFERENCES "TitaniumRadius"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "TitaniumCategory" ("id", "name", "details", "hubSortOrder", "createdAt", "updatedAt")
VALUES ('seed_titanium_category', 'מלאי טיטניום', '', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "TitaniumModel" ("id", "categoryId", "name", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('seed_titanium_model_g5', 'seed_titanium_category', 'G5', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('seed_titanium_model_g4', 'seed_titanium_category', 'G4', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('seed_titanium_model_blank', 'seed_titanium_category', 'BLANK', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
