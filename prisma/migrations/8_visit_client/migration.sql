-- Visites rattachées au client (étape « expand » du retrait des leads).
-- Le lead devient facultatif ; il sera supprimé par une migration ultérieure.

-- DropForeignKey
ALTER TABLE "visit" DROP CONSTRAINT "visit_leadId_fkey";

-- AlterTable
ALTER TABLE "visit" ADD COLUMN     "clientId" TEXT,
ALTER COLUMN "leadId" DROP NOT NULL;

-- Backfill : le client de chaque visite existante est celui de son lead (Lead.clientId est obligatoire)
UPDATE "visit" AS v SET "clientId" = l."clientId" FROM "lead" AS l WHERE v."leadId" = l."id";

-- CreateIndex
CREATE INDEX "visit_clientId_idx" ON "visit"("clientId");

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Retour arrière (manuel, tant qu'aucune visite n'a été créée sans lead) :
--   ALTER TABLE "visit" DROP CONSTRAINT "visit_clientId_fkey";
--   DROP INDEX "visit_clientId_idx";
--   ALTER TABLE "visit" DROP COLUMN "clientId";
--   ALTER TABLE "visit" DROP CONSTRAINT "visit_leadId_fkey";
--   ALTER TABLE "visit" ALTER COLUMN "leadId" SET NOT NULL;
--   ALTER TABLE "visit" ADD CONSTRAINT "visit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
