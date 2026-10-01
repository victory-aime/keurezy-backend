-- Questionnaire de départ facultatif (décisions du 2026-10-01) : raisons données à la résiliation
-- de l'abonnement ou à la fermeture de l'agence. Additive.

-- CreateEnum
CREATE TYPE "ExitFeedbackContext" AS ENUM ('SUBSCRIPTION_CANCEL', 'AGENCY_CLOSE');

-- CreateEnum
CREATE TYPE "ExitFeedbackReason" AS ENUM ('TOO_EXPENSIVE', 'MISSING_FEATURES', 'LOW_USAGE', 'SWITCHING_TOOL', 'TECHNICAL_ISSUE', 'BUSINESS_CLOSING', 'OTHER');

-- CreateTable
CREATE TABLE "exit_feedback" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "context" "ExitFeedbackContext" NOT NULL,
    "reason" "ExitFeedbackReason",
    "comment" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exit_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exit_feedback_context_createdAt_idx" ON "exit_feedback"("context", "createdAt");

-- AddForeignKey
ALTER TABLE "exit_feedback" ADD CONSTRAINT "exit_feedback_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
