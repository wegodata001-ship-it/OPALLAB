-- Attendance-only lab assistant role.
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'ASSISTANT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
