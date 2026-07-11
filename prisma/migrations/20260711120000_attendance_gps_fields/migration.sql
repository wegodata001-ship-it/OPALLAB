-- Attendance GPS fields (check-in / check-out locations)
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "checkInLatitude" DOUBLE PRECISION;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "checkInLongitude" DOUBLE PRECISION;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "checkInAccuracy" DOUBLE PRECISION;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "checkInAddress" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "checkOutLatitude" DOUBLE PRECISION;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "checkOutLongitude" DOUBLE PRECISION;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "checkOutAccuracy" DOUBLE PRECISION;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "checkOutAddress" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "deviceInfo" TEXT;

UPDATE "AttendanceRecord"
SET
  "checkInLatitude" = "latitude",
  "checkInLongitude" = "longitude"
WHERE "checkInLatitude" IS NULL AND "latitude" IS NOT NULL;
