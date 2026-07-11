-- Attendance V2: GPS as attendance method (selfie stored in photo URL fields)
ALTER TYPE "AttendanceMethod" ADD VALUE IF NOT EXISTS 'GPS';
