-- Facturation des agences à leurs clients, module I2 (factures) : spec docs/agency-invoicing.
-- Additive. Numéro attribué à l'émission par invoice_counter (UPDATE atomique), unique par agence.

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoicePaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHECK', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "invoice" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "bookingId" TEXT,
    "templateId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "clientAddress" TEXT,
    "lines" JSONB NOT NULL,
    "totalHt" INTEGER NOT NULL,
    "totalVat" INTEGER NOT NULL,
    "totalTtc" INTEGER NOT NULL,
    "dueAt" DATE NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "paidAt" DATE,
    "paymentMethod" "InvoicePaymentMethod",
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counter" (
    "agencyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_counter_pkey" PRIMARY KEY ("agencyId","year")
);

-- CreateIndex
CREATE INDEX "invoice_agencyId_status_createdAt_idx" ON "invoice"("agencyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "invoice_agencyId_issuedAt_idx" ON "invoice"("agencyId", "issuedAt");

-- CreateIndex
CREATE INDEX "invoice_bookingId_idx" ON "invoice"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_agencyId_number_key" ON "invoice"("agencyId", "number");

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "invoice_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Une facture émise, payée ou annulée a toujours un numéro ; un brouillon n'en a pas
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_number_by_status" CHECK (("status" = 'DRAFT') = ("number" IS NULL));
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_totals_positive" CHECK ("totalHt" >= 0 AND "totalVat" >= 0 AND "totalTtc" >= 0);
