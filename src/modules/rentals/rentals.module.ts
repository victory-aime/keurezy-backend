import { Module } from '@nestjs/common';
import { RentalConfigService } from './rental-config.service';

/**
 * Modalités de location des biens (types, prix, disponibilités).
 * Les réservations s'appuieront sur ce module pour calculer les créneaux libres.
 */
@Module({
  providers: [RentalConfigService],
  exports: [RentalConfigService],
})
export class RentalsModule {}
