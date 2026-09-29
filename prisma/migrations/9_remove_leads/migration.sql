-- Retrait des leads (étape « contract ») : le chat et les réservations couvrent la prise de contact,
-- les visites portent le client depuis 8_visit_client.

-- Feature `manage_leads` et ses permissions (plans, membres, invitations en attente)
DELETE FROM "plan_feature" WHERE "featureId" IN (SELECT "id" FROM "feature" WHERE "name" = 'manage_leads');
DELETE FROM "staff_permission" WHERE "permissionId" IN (
  SELECT p."id" FROM "permission" p JOIN "feature" f ON f."id" = p."featureId" WHERE f."name" = 'manage_leads'
);
DELETE FROM "invitation_permission" WHERE "permissionId" IN (
  SELECT p."id" FROM "permission" p JOIN "feature" f ON f."id" = p."featureId" WHERE f."name" = 'manage_leads'
);
DELETE FROM "feature" WHERE "name" = 'manage_leads';

-- DropForeignKey
ALTER TABLE "lead" DROP CONSTRAINT "lead_clientId_fkey";

-- DropForeignKey
ALTER TABLE "lead" DROP CONSTRAINT "lead_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "lead" DROP CONSTRAINT "lead_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "lead" DROP CONSTRAINT "lead_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "visit" DROP CONSTRAINT "visit_leadId_fkey";

-- DropForeignKey
ALTER TABLE "tenant" DROP CONSTRAINT "tenant_leadId_fkey";

-- DropIndex
DROP INDEX "tenant_leadId_key";

-- AlterTable
ALTER TABLE "visit" DROP COLUMN "leadId";

-- AlterTable
ALTER TABLE "tenant" DROP COLUMN "leadId";

-- DropTable
DROP TABLE "lead";

-- DropEnum
DROP TYPE "LeadStatus";

