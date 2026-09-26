-- Reprise des biens créés avant les modalités de location.
-- Leur prix et leur caution étaient pensés comme un loyer : on crée une modalité MENSUELLE
-- active, sans période de disponibilité (réservable à tout moment).
-- Idempotent : seuls les biens sans aucune modalité sont concernés.

INSERT INTO "property_rental_config" (
    "id",
    "propertyId",
    "rentalType",
    "price",
    "deposit",
    "minDuration",
    "maxDuration",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    p."id",
    'MONTHLY'::"RentalType",
    p."price",
    GREATEST(COALESCE(p."caution", 0), 0),
    1,
    NULL,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "property" p
WHERE p."price" >= 0
  AND NOT EXISTS (
    SELECT 1 FROM "property_rental_config" c WHERE c."propertyId" = p."id"
  );
