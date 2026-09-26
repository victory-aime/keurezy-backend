-- CreateEnum
CREATE TYPE "RentalType" AS ENUM ('DAILY', 'NIGHTLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "property_rental_config" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "rentalType" "RentalType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "deposit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minDuration" INTEGER DEFAULT 1,
    "maxDuration" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_rental_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_availability" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "rentalType" "RentalType",
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "clientId" TEXT,
    "rentalType" "RentalType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "depositAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_rental_config_propertyId_idx" ON "property_rental_config"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "property_rental_config_propertyId_rentalType_key" ON "property_rental_config"("propertyId", "rentalType");

-- CreateIndex
CREATE INDEX "property_availability_propertyId_startDate_endDate_idx" ON "property_availability"("propertyId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "booking_propertyId_startDate_endDate_idx" ON "booking"("propertyId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "booking_agencyId_status_idx" ON "booking"("agencyId", "status");

-- AddForeignKey
ALTER TABLE "property_rental_config" ADD CONSTRAINT "property_rental_config_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_availability" ADD CONSTRAINT "property_availability_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Invariants métier garantis par la base (non exprimables dans le schéma Prisma)
ALTER TABLE "property_rental_config"
  ADD CONSTRAINT "property_rental_config_price_check" CHECK ("price" >= 0),
  ADD CONSTRAINT "property_rental_config_deposit_check" CHECK ("deposit" >= 0),
  ADD CONSTRAINT "property_rental_config_duration_check" CHECK (
    ("minDuration" IS NULL OR "minDuration" >= 1)
    AND ("maxDuration" IS NULL OR "minDuration" IS NULL OR "maxDuration" >= "minDuration")
  );

ALTER TABLE "property_availability"
  ADD CONSTRAINT "property_availability_dates_check" CHECK ("endDate" >= "startDate");

ALTER TABLE "booking"
  ADD CONSTRAINT "booking_dates_check" CHECK ("endDate" >= "startDate"),
  ADD CONSTRAINT "booking_amounts_check" CHECK ("totalAmount" >= 0 AND "depositAmount" >= 0);
