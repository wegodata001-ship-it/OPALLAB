-- Zirconia catalog only. Does not alter existing inventory items, quantities, or orders.

CREATE TABLE "ZirconiaModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZirconiaModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZirconiaAttribute" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZirconiaAttribute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ZirconiaAttributeValue" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZirconiaAttributeValue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ZirconiaModel_sortOrder_idx" ON "ZirconiaModel"("sortOrder");
CREATE INDEX "ZirconiaAttribute_modelId_sortOrder_idx" ON "ZirconiaAttribute"("modelId", "sortOrder");
CREATE INDEX "ZirconiaAttributeValue_attributeId_sortOrder_idx" ON "ZirconiaAttributeValue"("attributeId", "sortOrder");

ALTER TABLE "ZirconiaAttribute" ADD CONSTRAINT "ZirconiaAttribute_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ZirconiaModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ZirconiaAttributeValue" ADD CONSTRAINT "ZirconiaAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ZirconiaAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One-time starting catalog. Stable ids, empty value lists. Re-running does not duplicate or rename.
INSERT INTO "ZirconiaModel" ("id", "name", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('seed_zirconia_model_ai', 'AI', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('seed_zirconia_model_am', 'AM', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('seed_zirconia_model_ar', 'AR', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ZirconiaAttribute" ("id", "modelId", "name", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('seed_zirconia_attr_ai_color', 'seed_zirconia_model_ai', 'צבע', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('seed_zirconia_attr_ai_length', 'seed_zirconia_model_ai', 'אורך', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
