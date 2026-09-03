-- Additive: link Order → work CHARGE Payment (idempotent billing on production complete).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ledgerChargeId" TEXT;
