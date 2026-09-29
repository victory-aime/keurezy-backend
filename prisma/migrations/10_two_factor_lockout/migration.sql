-- Better Auth 1.6.33 : verrouillage de la 2FA après trop de codes faux.
-- Migration additive (expand), sans impact sur les lignes existantes.

-- AlterTable
ALTER TABLE "twofactor" ADD COLUMN "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3);
