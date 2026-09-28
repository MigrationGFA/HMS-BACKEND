-- Phase 1: external telemedicine meeting link on online bookings
ALTER TABLE "SERVICE_BOOKINGS"
  ADD COLUMN IF NOT EXISTS "MEETING_URL" VARCHAR(500);
