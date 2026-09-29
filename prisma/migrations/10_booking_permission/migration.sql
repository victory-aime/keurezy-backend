-- Catégorie des permissions de réservation. Les données (feature manage_bookings, permissions,
-- plans) sont créées par le seed : une valeur d'enum ne peut pas servir dans sa transaction de création.
-- AlterEnum
ALTER TYPE "FeatureCategory" ADD VALUE 'BOOKINGS';

