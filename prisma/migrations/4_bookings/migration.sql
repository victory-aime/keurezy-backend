-- Réservations : type de notification dédié, durée réservée et index des réservations d'un client.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING';

ALTER TABLE "booking" ADD COLUMN "duration" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "booking" ADD CONSTRAINT "booking_duration_check" CHECK ("duration" >= 1);

CREATE INDEX "booking_clientId_idx" ON "booking"("clientId");
