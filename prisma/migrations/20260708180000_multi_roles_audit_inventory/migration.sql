-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'CATEGORY_CHANGE';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'EDIT';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'DELETE';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "fromCategory" TEXT,
ADD COLUMN IF NOT EXISTS "fromLocation" TEXT,
ADD COLUMN IF NOT EXISTS "reason" TEXT,
ADD COLUMN IF NOT EXISTS "supplier" TEXT,
ADD COLUMN IF NOT EXISTS "toCategory" TEXT,
ADD COLUMN IF NOT EXISTS "toLocation" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authUserId" TEXT,
ADD COLUMN IF NOT EXISTS "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];

-- CreateTable
CREATE TABLE IF NOT EXISTS "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_name_key" ON "Warehouse"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_authUserId_key" ON "User"("authUserId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Backfill roles from legacy single role column
UPDATE "User" SET roles = ARRAY[role]::"UserRole"[] WHERE cardinality(roles) = 0;
