-- Checkout d'abonnement : clé d'idempotence côté client et date d'effet du downgrade.
-- Migration additive (expand). Spec : keurezy-front/docs/subscription-ui/plan-subscription-checkout.md

-- AlterTable
ALTER TABLE "payment_transaction" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "payment_transaction_idempotencyKey_key" ON "payment_transaction"("idempotencyKey");
