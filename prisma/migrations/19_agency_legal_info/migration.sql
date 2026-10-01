-- Informations légales de l'agence (spec docs/agency-legal-info, 2026-10-02). Additive.
-- Une agence ne peut être vérifiée que si ces informations sont complètes : aucune ne l'est encore,
-- les agences vérifiées repassent donc non vérifiées.

-- CreateEnum
CREATE TYPE "LegalForm" AS ENUM ('SARL', 'SUARL', 'SA', 'SAS', 'SASU', 'GIE', 'INDIVIDUAL', 'OTHER');

-- AlterTable
ALTER TABLE "agency" ADD COLUMN "companyName" TEXT,
ADD COLUMN "legalForm" "LegalForm",
ADD COLUMN "ninea" TEXT,
ADD COLUMN "rccm" TEXT,
ADD COLUMN "billingAddress" TEXT,
ADD COLUMN "billingEmail" TEXT;

-- Vérification retirée tant que les informations légales manquent
UPDATE "agency" SET "isVerified" = false WHERE "isVerified" = true;
