-- Chat client ↔ agence rattaché à un bien (et optionnellement à une réservation).
-- Remplace l'ancien chat LEAD / DIRECT. Prérequis : table conversation vide.

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'DOCUMENT', 'AUDIO');

-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'AUDIO';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MESSAGE';

-- AlterEnum
ALTER TYPE "FeatureCategory" ADD VALUE 'MESSAGING';

-- DropForeignKey
ALTER TABLE "conversation" DROP CONSTRAINT "conversation_leadId_fkey";

-- DropIndex
DROP INDEX "conversation_leadId_key";

-- DropIndex
DROP INDEX "conversation_lastMessageAt_idx";

-- DropIndex
DROP INDEX "conversation_leadId_idx";

-- AlterTable
ALTER TABLE "conversation" DROP COLUMN "leadId",
DROP COLUMN "type",
ADD COLUMN     "agencyId" TEXT NOT NULL,
ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "clientId" TEXT NOT NULL,
ADD COLUMN     "propertyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "message" ALTER COLUMN "content" SET DEFAULT '';

-- DropEnum
DROP TYPE "ConversationType";

-- CreateTable
CREATE TABLE "message_attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_attachment_messageId_idx" ON "message_attachment"("messageId");

-- CreateIndex
CREATE INDEX "conversation_agencyId_lastMessageAt_idx" ON "conversation"("agencyId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "conversation_clientId_lastMessageAt_idx" ON "conversation"("clientId", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_clientId_agencyId_propertyId_key" ON "conversation"("clientId", "agencyId", "propertyId");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

