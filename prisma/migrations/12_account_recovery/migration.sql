-- Récupération de compte quand la 2FA est perdue : demande exécutée après 72 h, annulable.
-- Migration additive (expand).

-- CreateEnum
CREATE TYPE "AccountRecoveryStatus" AS ENUM ('PENDING', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "account_recovery_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AccountRecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "executeAt" TIMESTAMP(3) NOT NULL,
    "cancelTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_recovery_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_recovery_request_cancelTokenHash_key" ON "account_recovery_request"("cancelTokenHash");

-- CreateIndex
CREATE INDEX "account_recovery_request_status_executeAt_idx" ON "account_recovery_request"("status", "executeAt");

-- CreateIndex
CREATE INDEX "account_recovery_request_userId_idx" ON "account_recovery_request"("userId");

-- AddForeignKey
ALTER TABLE "account_recovery_request" ADD CONSTRAINT "account_recovery_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

