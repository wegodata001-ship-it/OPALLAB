-- Doctor parts inventory and order consumption.
-- Does not alter other inventory modules, prices, work types, or existing orders.
-- Quantity is allowed to be negative. No sample parts are inserted.

CREATE TYPE "DoctorPartMovementType" AS ENUM (
    'STOCK_IN',
    'STOCK_OUT',
    'ORDER_CONSUMPTION',
    'ORDER_ADJUSTMENT',
    'ORDER_RETURN',
    'MANUAL_CORRECTION'
);

CREATE TABLE "DoctorPart" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DoctorPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderPart" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "appliedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DoctorPartMovement" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderSerial" TEXT NOT NULL DEFAULT '',
    "operationId" TEXT NOT NULL,
    "type" "DoctorPartMovementType" NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoctorPartMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DoctorPart_archivedAt_name_idx" ON "DoctorPart"("archivedAt", "name");
CREATE UNIQUE INDEX "OrderPart_orderId_partId_key" ON "OrderPart"("orderId", "partId");
CREATE INDEX "OrderPart_partId_idx" ON "OrderPart"("partId");
CREATE UNIQUE INDEX "DoctorPartMovement_operationId_key" ON "DoctorPartMovement"("operationId");
CREATE INDEX "DoctorPartMovement_partId_createdAt_idx" ON "DoctorPartMovement"("partId", "createdAt");
CREATE INDEX "DoctorPartMovement_orderId_idx" ON "DoctorPartMovement"("orderId");
CREATE INDEX "DoctorPartMovement_createdAt_idx" ON "DoctorPartMovement"("createdAt");

ALTER TABLE "OrderPart" ADD CONSTRAINT "OrderPart_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderPart" ADD CONSTRAINT "OrderPart_partId_fkey" FOREIGN KEY ("partId") REFERENCES "DoctorPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DoctorPartMovement" ADD CONSTRAINT "DoctorPartMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "DoctorPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DoctorPartMovement" ADD CONSTRAINT "DoctorPartMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DoctorPartMovement" ADD CONSTRAINT "DoctorPartMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
