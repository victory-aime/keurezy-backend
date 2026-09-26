import { Module } from '@nestjs/common';
import { RentalConfigService } from './rental-config.service';
import { RentalAvailabilityService } from './rental-availability.service';
import { RentalQuoteService } from './rental-quote.service';

/**
 * Modalités de location des biens (types, prix, disponibilités),
 * calcul des créneaux libres et devis. Les réservations s'appuieront sur ce module.
 */
@Module({
  providers: [RentalConfigService, RentalAvailabilityService, RentalQuoteService],
  exports: [RentalConfigService, RentalAvailabilityService, RentalQuoteService],
})
export class RentalsModule {}
