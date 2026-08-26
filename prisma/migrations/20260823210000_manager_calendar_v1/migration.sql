-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CalendarEventType" AS ENUM (
    'DOCTOR_MEETING', 'NEW_CLIENT', 'DELIVERY', 'PICKUP', 'TASK',
    'VACATION', 'BLOCKED', 'REVIEW', 'TEAM_MEETING', 'REMINDER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CalendarEventStatus" AS ENUM (
    'CONFIRMED', 'PENDING', 'DONE', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CalendarEvent" (
    "id" TEXT NOT NULL,
    "calendarKey" TEXT NOT NULL DEFAULT 'manager',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "type" "CalendarEventType" NOT NULL,
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'CONFIRMED',
    "color" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "phone" TEXT,
    "patientName" TEXT,
    "doctorName" TEXT,
    "orderId" TEXT,
    "doctorId" TEXT,
    "patientId" TEXT,
    "createdById" TEXT,
    "ownerUserId" TEXT,
    "recurrence" JSONB,
    "reminders" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CalendarEvent_calendarKey_startsAt_idx" ON "CalendarEvent"("calendarKey", "startsAt");
CREATE INDEX IF NOT EXISTS "CalendarEvent_startsAt_endsAt_idx" ON "CalendarEvent"("startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "CalendarEvent_type_status_idx" ON "CalendarEvent"("type", "status");
CREATE INDEX IF NOT EXISTS "CalendarEvent_orderId_idx" ON "CalendarEvent"("orderId");
CREATE INDEX IF NOT EXISTS "CalendarEvent_doctorId_idx" ON "CalendarEvent"("doctorId");

DO $$ BEGIN
  ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
