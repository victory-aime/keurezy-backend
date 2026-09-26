-- Nettoyage de l'ancienne modélisation des locations (supprimée du schéma par #32
-- mais restée en base via `db push`). Tables vérifiées vides avant suppression.
-- Idempotent : sans effet sur un environnement qui ne contient pas ces objets.

-- DropForeignKey
ALTER TABLE IF EXISTS "availabilities" DROP CONSTRAINT IF EXISTS "availabilities_rentalOptionId_fkey";
ALTER TABLE IF EXISTS "rental_options" DROP CONSTRAINT IF EXISTS "rental_options_propertyId_fkey";
ALTER TABLE IF EXISTS "reservations" DROP CONSTRAINT IF EXISTS "reservations_clientId_fkey";
ALTER TABLE IF EXISTS "reservations" DROP CONSTRAINT IF EXISTS "reservations_rentalOptionId_fkey";

-- DropTable
DROP TABLE IF EXISTS "availabilities";
DROP TABLE IF EXISTS "rental_options";
DROP TABLE IF EXISTS "reservations";

-- DropEnum
DROP TYPE IF EXISTS "AvailabilityStatus";
DROP TYPE IF EXISTS "RentalOptionStatus";
DROP TYPE IF EXISTS "RentalType";
DROP TYPE IF EXISTS "ReservationStatus";

-- AlterTable : aligne la base sur le schéma (aucune valeur NULL existante)
ALTER TABLE "property" ALTER COLUMN "price" SET NOT NULL,
ALTER COLUMN "caution" SET NOT NULL;
