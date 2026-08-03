-- Temporary order drafts: allow file uploads before final save.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- Drafts may be created before a doctor is selected.
ALTER TABLE "Order" ALTER COLUMN "doctorId" DROP NOT NULL;
