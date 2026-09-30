-- Fermeture d'agence différée : l'owner la programme, un cron l'exécute à la date prévue.
-- Migration additive (expand), sans impact sur les lignes existantes.

-- AlterTable
ALTER TABLE "agency" ADD COLUMN "closeScheduledAt" TIMESTAMP(3);
