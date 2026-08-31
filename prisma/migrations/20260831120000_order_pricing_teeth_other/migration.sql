-- Additive order pricing snapshot fields (teeth qty × unit, manual override, OTHER work).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "priceUnit" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "priceQuantity" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "calculatedPrice" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "priceManuallyEdited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "otherWorkKind" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "otherWorkNotes" TEXT;
