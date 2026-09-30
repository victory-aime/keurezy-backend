-- Abonnements : historique de paiement par agence, downgrade programmé, rappels de renouvellement,
-- et désactivation des biens au-delà d'une limite de plan. Migration additive (expand).
-- Spec : keurezy-front/docs/subscription-ui/spec-subscription-checkout.md, spec-billing-history.md

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ONBOARDING', 'RENEWAL', 'UPGRADE', 'REACTIVATION');

-- AlterTable
ALTER TABLE "batiment" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "payment_transaction" ADD COLUMN     "agencyId" TEXT,
ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'ONBOARDING';

-- AlterTable
ALTER TABLE "property" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "lastRenewalReminder" INTEGER,
ADD COLUMN     "scheduledBillingCycle" "BillingCycle",
ADD COLUMN     "scheduledKeep" JSONB,
ADD COLUMN     "scheduledPlanId" TEXT;

-- AlterTable
ALTER TABLE "terrains" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "payment_transaction_agencyId_createdAt_idx" ON "payment_transaction"("agencyId", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_transaction" ADD CONSTRAINT "payment_transaction_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill : rattache les transactions d'onboarding existantes à l'agence créée,
-- via l'e-mail d'agence conservé dans le metadata. Les transactions sans agence restent à NULL.
UPDATE "payment_transaction" pt
SET "agencyId" = a."id"
FROM "agency" a
WHERE pt."agencyId" IS NULL
  AND pt."metadata"->>'agencyEmail' = a."email";
