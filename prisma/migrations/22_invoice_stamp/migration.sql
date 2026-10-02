-- Facturation, module I1 : cachet ou signature scanné de l'agence (image Cloudinary), imprimé
-- dans la zone « Signature et cachet » des modèles qui le demandent. Additive.

-- AlterTable
ALTER TABLE "agency" ADD COLUMN "invoiceStampUrl" TEXT;
