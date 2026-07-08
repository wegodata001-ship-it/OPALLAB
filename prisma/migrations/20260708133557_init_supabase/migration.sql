-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SECRETARY', 'DESIGNER', 'PRINTER', 'MILLING', 'PROCESSING', 'FINISH', 'PACKAGING', 'DOCTOR', 'OWNER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('TEMPORARY', 'DENTURE', 'PFM', 'ZIRCONIA', 'TITANIUM', 'MODEL');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('SCREWED', 'ABUTMENTS', 'MOCKUP', 'BAR', 'NIGHT_GUARD_WHITENING_MILLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RECEIVED', 'FILES_ATTACHED', 'DESIGN', 'PRINTING_3D', 'MILLING', 'PROCESSING', 'FINISH', 'PACKAGING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('RAW_MATERIALS', 'PARTS_COMPONENTS', 'OWNER_ASSETS');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PLX', 'STL', 'OBJ', 'PLY', 'OTHER_3D', 'IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('NFC', 'MANUAL', 'GEOFENCE_AUTO', 'WIFI');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('MONTHLY', 'HOURLY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'TRANSFER', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PAYMENT', 'CHARGE', 'SALARY');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "nfcTagId" TEXT,
    "address" TEXT,
    "salary" DOUBLE PRECISION,
    "salaryType" "SalaryType",
    "hourlyRate" DOUBLE PRECISION,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "clinic" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Courier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Courier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "gender" "Gender",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completionDate" TIMESTAMP(3),
    "shade" TEXT,
    "materials" "MaterialType"[],
    "workTypes" "WorkType"[],
    "selectedTeeth" INTEGER[],
    "description" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "assignedDesignerId" TEXT,
    "processingEmployeeId" TEXT,
    "finishEmployeeId" TEXT,
    "totalPrice" DOUBLE PRECISION,
    "notes" TEXT,
    "completedStages" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,
    "fileSize" INTEGER,
    "storagePath" TEXT,
    "bucket" TEXT,
    "mimeType" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "OrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "inventoryType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "storagePath" TEXT,
    "purchaseCost" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'יחידה',
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" "MovementType" NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "orderRef" TEXT,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUsage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "InventoryUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryNote" TEXT NOT NULL,
    "packagedBy" TEXT,
    "packagedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "courierName" TEXT,
    "courierPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT,
    "employeeId" TEXT,
    "orderId" TEXT,
    "serialNumber" TEXT,
    "patientName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "description" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "referenceNumber" TEXT,
    "deliveryNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "method" "AttendanceMethod" NOT NULL,
    "nfcTagId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_nfcTagId_key" ON "User"("nfcTagId");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");

-- CreateIndex
CREATE INDEX "Doctor_name_idx" ON "Doctor"("name");

-- CreateIndex
CREATE INDEX "Doctor_paymentStatus_idx" ON "Doctor"("paymentStatus");

-- CreateIndex
CREATE INDEX "Courier_isActive_idx" ON "Courier"("isActive");

-- CreateIndex
CREATE INDEX "Patient_name_idx" ON "Patient"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_serialNumber_key" ON "Order"("serialNumber");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_doctorId_idx" ON "Order"("doctorId");

-- CreateIndex
CREATE INDEX "Order_entryDate_idx" ON "Order"("entryDate");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderFile_orderId_idx" ON "OrderFile"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryCategory_isSystem_idx" ON "InventoryCategory"("isSystem");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_barcode_key" ON "InventoryItem"("barcode");

-- CreateIndex
CREATE INDEX "InventoryItem_inventoryType_isActive_idx" ON "InventoryItem"("inventoryType", "isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_createdAt_idx" ON "InventoryMovement"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_deliveryNote_key" ON "Shipment"("deliveryNote");

-- CreateIndex
CREATE INDEX "Shipment_deliveryNote_idx" ON "Shipment"("deliveryNote");

-- CreateIndex
CREATE INDEX "Payment_doctorId_createdAt_idx" ON "Payment"("doctorId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_employeeId_createdAt_idx" ON "Payment"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_type_status_idx" ON "Payment"("type", "status");

-- CreateIndex
CREATE INDEX "AttendanceRecord_userId_checkIn_idx" ON "AttendanceRecord"("userId", "checkIn");

-- CreateIndex
CREATE INDEX "AttendanceRecord_checkOut_idx" ON "AttendanceRecord"("checkOut");

-- CreateIndex
CREATE UNIQUE INDEX "LabSettings_key_key" ON "LabSettings"("key");

-- AddForeignKey
ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedDesignerId_fkey" FOREIGN KEY ("assignedDesignerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_processingEmployeeId_fkey" FOREIGN KEY ("processingEmployeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_finishEmployeeId_fkey" FOREIGN KEY ("finishEmployeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsage" ADD CONSTRAINT "InventoryUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUsage" ADD CONSTRAINT "InventoryUsage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
