-- Ensure GPS exists on AttendanceMethod (idempotent; safe if already applied)
ALTER TYPE "AttendanceMethod" ADD VALUE IF NOT EXISTS 'GPS';
