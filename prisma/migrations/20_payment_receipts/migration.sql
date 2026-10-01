-- Reçus de paiement (spec docs/subscription-receipts, 2026-10-02). Additive.
-- Numéro continu par séquence (sans doublon en concurrence) et copie de l'agence au jour du
-- paiement : un reçu ne change pas après coup.

-- AlterTable
ALTER TABLE "payment_transaction" ADD COLUMN "receiptNumber" TEXT,
ADD COLUMN "receiptAgency" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "payment_transaction_receiptNumber_key" ON "payment_transaction"("receiptNumber");

-- Séquence des numéros de reçu
CREATE SEQUENCE "receipt_number_seq";

-- Paiements déjà payés : numéros dans l'ordre de paiement ; agence telle qu'aujourd'hui (meilleure
-- information disponible)
WITH numbered AS (
  SELECT p."id",
         COALESCE(p."confirmed_at", p."updatedAt") AS paid_at,
         ROW_NUMBER() OVER (ORDER BY COALESCE(p."confirmed_at", p."updatedAt"), p."id") AS n
  FROM "payment_transaction" p
  WHERE p."status" = 'PAID' AND p."agencyId" IS NOT NULL
)
UPDATE "payment_transaction" p
SET "receiptNumber" = 'KRZ-' || to_char(numbered.paid_at, 'YYYY') || '-' || lpad(numbered.n::text, 6, '0'),
    "receiptAgency" = jsonb_build_object(
      'name', a."name",
      'companyName', a."companyName",
      'legalForm', a."legalForm",
      'ninea', a."ninea",
      'rccm', a."rccm",
      'address', COALESCE(a."billingAddress", a."address"),
      'email', COALESCE(a."billingEmail", a."email")
    )
FROM numbered, "agency" a
WHERE p."id" = numbered."id" AND a."id" = p."agencyId";

-- La séquence reprend après le dernier numéro attribué
SELECT setval('"receipt_number_seq"', GREATEST((SELECT COUNT(*) FROM "payment_transaction" WHERE "receiptNumber" IS NOT NULL), 1), (SELECT COUNT(*) FROM "payment_transaction" WHERE "receiptNumber" IS NOT NULL) > 0);
