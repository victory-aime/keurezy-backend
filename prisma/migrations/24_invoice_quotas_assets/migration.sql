-- Facturation, module I3 : catégories des fonctionnalités de facturation et de l'agence (quotas et
-- permissions créés par le seed), et images figées des factures émises. Additive.

-- AlterEnum (PostgreSQL 12 et plus : plusieurs valeurs dans une même migration)
ALTER TYPE "FeatureCategory" ADD VALUE IF NOT EXISTS 'INVOICING';
ALTER TYPE "FeatureCategory" ADD VALUE IF NOT EXISTS 'AGENCY';

-- Logo et cachet copiés à l'émission, identifiés par leur empreinte SHA-256
CREATE TABLE "invoice_asset" (
    "id" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_asset_pkey" PRIMARY KEY ("id")
);
