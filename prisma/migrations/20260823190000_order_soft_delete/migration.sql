-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "statusBeforeDelete" "OrderStatus";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_deletedAt_idx" ON "Order"("deletedAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_deletedBy_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_deletedBy_fkey"
      FOREIGN KEY ("deletedBy") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
