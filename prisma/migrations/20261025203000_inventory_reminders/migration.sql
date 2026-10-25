-- Inventory reminders and mandatory counts. Adds tables and optional skip fields only.
-- Does not update quantities, delete stock, or change existing count rows.

ALTER TABLE "InventoryCountLine" ADD COLUMN "skipReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "InventoryCountLine" ADD COLUMN "skipApprovedAt" TIMESTAMP(3);
ALTER TABLE "InventoryCountLine" ADD COLUMN "skipApprovedById" TEXT;

CREATE TYPE "InventoryCountTaskStatus" AS ENUM ('PLANNED', 'DUE', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED', 'OVERDUE');
CREATE TYPE "InventoryAlertKind" AS ENUM ('COUNT_UPCOMING', 'COUNT_DUE', 'COUNT_OVERDUE', 'COUNT_INCOMPLETE', 'COUNT_ESCALATION', 'LOW_STOCK', 'ZERO_STOCK', 'VARIANCE', 'NEVER_COUNTED');
CREATE TYPE "InventoryAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "InventoryAlertAudience" AS ENUM ('MANAGER', 'SECRETARY', 'BOTH');

CREATE TABLE "InventoryCountPolicy" (
    "id" TEXT NOT NULL,
    "inventoryType" "InventoryModuleType" NOT NULL,
    "frequencyDays" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryCountPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountTask" (
    "id" TEXT NOT NULL,
    "inventoryType" "InventoryModuleType" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InventoryCountTaskStatus" NOT NULL DEFAULT 'PLANNED',
    "countId" TEXT,
    "assignedToId" TEXT,
    "startedById" TEXT,
    "submittedById" TEXT,
    "overdueDays" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryCountTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryAlert" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" "InventoryAlertKind" NOT NULL,
    "severity" "InventoryAlertSeverity" NOT NULL,
    "audience" "InventoryAlertAudience" NOT NULL DEFAULT 'BOTH',
    "inventoryType" "InventoryModuleType",
    "taskId" TEXT,
    "itemId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "overdueDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryAlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryAlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryStockThreshold" (
    "id" TEXT NOT NULL,
    "inventoryType" "InventoryModuleType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "minQuantity" INTEGER,
    "targetQuantity" INTEGER,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryStockThreshold_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryReplenishmentTask" (
    "id" TEXT NOT NULL,
    "inventoryType" "InventoryModuleType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER,
    "minQuantity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryReplenishmentTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryReminderRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "summary" JSONB,
    "error" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "InventoryReminderRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryCountPolicy_inventoryType_key" ON "InventoryCountPolicy"("inventoryType");
CREATE UNIQUE INDEX "InventoryCountTask_countId_key" ON "InventoryCountTask"("countId");
CREATE UNIQUE INDEX "InventoryCountTask_inventoryType_periodKey_key" ON "InventoryCountTask"("inventoryType", "periodKey");
CREATE INDEX "InventoryCountTask_status_dueDate_idx" ON "InventoryCountTask"("status", "dueDate");
CREATE INDEX "InventoryCountTask_assignedToId_idx" ON "InventoryCountTask"("assignedToId");
CREATE UNIQUE INDEX "InventoryAlert_dedupeKey_key" ON "InventoryAlert"("dedupeKey");
CREATE INDEX "InventoryAlert_status_createdAt_idx" ON "InventoryAlert"("status", "createdAt");
CREATE INDEX "InventoryAlert_taskId_idx" ON "InventoryAlert"("taskId");
CREATE INDEX "InventoryAlert_kind_inventoryType_idx" ON "InventoryAlert"("kind", "inventoryType");
CREATE INDEX "InventoryAlertEvent_alertId_createdAt_idx" ON "InventoryAlertEvent"("alertId", "createdAt");
CREATE UNIQUE INDEX "InventoryStockThreshold_inventoryType_itemId_key" ON "InventoryStockThreshold"("inventoryType", "itemId");
CREATE INDEX "InventoryReplenishmentTask_status_inventoryType_idx" ON "InventoryReplenishmentTask"("status", "inventoryType");
CREATE INDEX "InventoryReminderRun_startedAt_idx" ON "InventoryReminderRun"("startedAt");
CREATE INDEX "InventoryCountLine_skipApprovedById_idx" ON "InventoryCountLine"("skipApprovedById");

ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_skipApprovedById_fkey" FOREIGN KEY ("skipApprovedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountPolicy" ADD CONSTRAINT "InventoryCountPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountTask" ADD CONSTRAINT "InventoryCountTask_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountTask" ADD CONSTRAINT "InventoryCountTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountTask" ADD CONSTRAINT "InventoryCountTask_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountTask" ADD CONSTRAINT "InventoryCountTask_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAlert" ADD CONSTRAINT "InventoryAlert_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InventoryCountTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryAlertEvent" ADD CONSTRAINT "InventoryAlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "InventoryAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryStockThreshold" ADD CONSTRAINT "InventoryStockThreshold_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReplenishmentTask" ADD CONSTRAINT "InventoryReplenishmentTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
