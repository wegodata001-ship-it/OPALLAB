-- Remove attendance selfie / registration photo columns
ALTER TABLE "TrustedDevice" DROP COLUMN IF EXISTS "registrationPhotoPath";

ALTER TABLE "AttendanceRecord" DROP COLUMN IF EXISTS "checkInPhotoUrl";
ALTER TABLE "AttendanceRecord" DROP COLUMN IF EXISTS "checkOutPhotoUrl";
ALTER TABLE "AttendanceRecord" DROP COLUMN IF EXISTS "checkInPhotoPath";
ALTER TABLE "AttendanceRecord" DROP COLUMN IF EXISTS "checkOutPhotoPath";
