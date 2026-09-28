-- Préférences utilisateur (notifications d'abord) et notifications de nouvelles annonces.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LISTING';

-- CreateTable
CREATE TABLE "user_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifications" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preference_userId_key" ON "user_preference"("userId");

-- AddForeignKey
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

