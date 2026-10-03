-- Pièces justificatives des informations légales (statuts, NINEA, RCCM). Additive.
-- Une pièce manquante bloque la vérification : les agences vérifiées sans pièces
-- repassent non vérifiées.

ALTER TABLE "agency" ADD COLUMN "legalFormProofUrl" TEXT,
ADD COLUMN "nineaProofUrl" TEXT,
ADD COLUMN "rccmProofUrl" TEXT;

UPDATE "agency" SET "isVerified" = false WHERE "isVerified" = true;
