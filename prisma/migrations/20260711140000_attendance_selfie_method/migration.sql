-- Attendance V2: add SELFIE method (superseded — use GPS; kept for migration history)
ALTER TYPE "AttendanceMethod" ADD VALUE IF NOT EXISTS 'SELFIE';
