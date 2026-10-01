-- Contraction : fin du modèle à la commission (décisions du 2026-10-01), seul l'abonnement reste.
-- Prérequis : `pnpm subscription:commission-to-free:<env> -- --apply` (agences commission passées
-- au plan Gratuit, plans commission supprimés), et le code qui ne lit plus ces colonnes déployé.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "subscription_plan" WHERE "name"::text LIKE '%\_COMMISSION') THEN
    RAISE EXCEPTION 'Plans commission encore presents : lancer subscription:commission-to-free avant cette migration';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "subscription" DROP COLUMN "pricingType",
DROP COLUMN "commissionRate";

-- AlterTable
ALTER TABLE "subscription_plan" DROP COLUMN "pricingType",
DROP COLUMN "commissionRate",
DROP COLUMN "planCategory",
ALTER COLUMN "name" DROP DEFAULT;

-- DropEnum
DROP TYPE "PricingType";
DROP TYPE "PlanCategory";

-- AlterEnum : retrait des valeurs *_COMMISSION
ALTER TYPE "Plan" RENAME TO "Plan_old";
CREATE TYPE "Plan" AS ENUM ('FREE_SUB', 'BASIC_SUB', 'STANDARD_SUB', 'PREMIUM_SUB');
ALTER TABLE "subscription_plan" ALTER COLUMN "name" TYPE "Plan" USING ("name"::text::"Plan");
DROP TYPE "Plan_old";
