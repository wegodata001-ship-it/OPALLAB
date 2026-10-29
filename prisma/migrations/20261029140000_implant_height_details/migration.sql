-- Optional unit and notes on an implant size. Existing quantities and labels stay unchanged.
ALTER TABLE "ImplantHeight" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ImplantHeight" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
