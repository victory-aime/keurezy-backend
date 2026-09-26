import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AgencyModule } from '../agency/agency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RentalsModule } from '../rentals/rentals.module';

/** Réservations : demandes des clients, confirmation ou refus par l'agence. */
@Module({
  imports: [AgencyModule, NotificationsModule, RentalsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
