-- Enforce at most one work CHARGE per order (idempotency under concurrency).
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_one_work_charge_per_order_uidx"
ON "Payment" ("orderId")
WHERE type = 'CHARGE'
  AND "orderId" IS NOT NULL
  AND description LIKE 'חיוב עבודה%';
