-- Facturation, module I4 : historique des envois de factures par e-mail. Additive.

CREATE TABLE "invoice_email" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentBy" TEXT NOT NULL,
    "providerId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_email_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_email_invoiceId_sentAt_idx" ON "invoice_email"("invoiceId", "sentAt");

ALTER TABLE "invoice_email" ADD CONSTRAINT "invoice_email_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
