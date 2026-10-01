-- Facturation des agences à leurs clients, module I1 (modèles) : spec docs/agency-invoicing.
-- Additive. Les 3 modèles par défaut sont créés et tenus à jour par le backend au démarrage
-- (InvoiceTemplatesService), à partir d'une seule définition dans le code.

-- AlterTable
ALTER TABLE "agency" ADD COLUMN "bankName" TEXT,
ADD COLUMN "bankAccount" TEXT,
ADD COLUMN "mobileMoneyNumber" TEXT,
ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "invoicePrefix" TEXT NOT NULL DEFAULT 'FAC',
ADD COLUMN "defaultInvoiceTemplateId" TEXT;

-- CreateTable
CREATE TABLE "invoice_template" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT,
    "defaultKey" TEXT,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_template_defaultKey_key" ON "invoice_template"("defaultKey");

-- CreateIndex
CREATE INDEX "invoice_template_agencyId_idx" ON "invoice_template"("agencyId");

-- AddForeignKey
ALTER TABLE "invoice_template" ADD CONSTRAINT "invoice_template_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
