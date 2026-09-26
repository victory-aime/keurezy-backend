import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BookingStatus, RentalType } from '../../../prisma/generated/enums';
import { PropertyRentalConfig } from '../../../prisma/generated/client';
import { HttpError } from '../../config/http.error';
import {
  addDays,
  addMonths,
  CalendarRange,
  formatCalendarDate,
  parseCalendarDate,
  rentalLastDay,
  subtractRanges,
  todayCalendarDate,
} from './calendar-date';

/**
 * Seules les réservations confirmées occupent le bien : une demande en attente ne bloque pas
 * les dates (plusieurs demandes possibles, une seule confirmée). À revoir avec le paiement.
 */
export const BLOCKING_BOOKING_STATUSES = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED];

// Horizon par défaut de la recherche de créneaux, selon la durée typique d'une location
const DEFAULT_HORIZON_MONTHS: Record<RentalType, number> = {
  [RentalType.DAILY]: 6,
  [RentalType.NIGHTLY]: 6,
  [RentalType.MONTHLY]: 24,
  [RentalType.YEARLY]: 60,
};
const MAX_HORIZON_MONTHS = 60;

export interface FreeRangesResult {
  rentalType: RentalType;
  from: string;
  to: string;
  ranges: { startDate: string; endDate: string }[];
}

/**
 * Créneaux libres d'un bien pour un type de location :
 * périodes de disponibilité saisies − réservations confirmées (tous types confondus).
 * Les périodes ne sont jamais découpées en base : le découpage est calculé à la lecture.
 */
@Injectable()
export class RentalAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Modalité active du bien pour ce type, sinon erreur métier. */
  async getActiveConfig(propertyId: string, rentalType: RentalType): Promise<PropertyRentalConfig> {
    const config = await this.prisma.propertyRentalConfig.findUnique({
      where: { propertyId_rentalType: { propertyId, rentalType } },
    });

    if (!config?.isActive) {
      throw new HttpError(
        'Ce bien n’est pas proposé pour ce type de location',
        HttpStatus.NOT_FOUND,
        'RENTAL_TYPE_NOT_OFFERED',
      );
    }
    return config;
  }

  /** Plages réservables entre `from` et `to` (par défaut : aujourd'hui → horizon du type). */
  async getFreeRanges(
    propertyId: string,
    rentalType: RentalType,
    from?: string,
    to?: string,
  ): Promise<FreeRangesResult> {
    const config = await this.getActiveConfig(propertyId, rentalType);
    const window = this.resolveWindow(rentalType, from, to);

    // Une plage plus courte que la durée minimale de réservation n'est pas proposée
    const minUnits = config.minDuration ?? 1;
    const ranges = (await this.computeFreeRanges(propertyId, rentalType, window)).filter(
      (range) => rentalLastDay(rentalType, range.start, minUnits) <= range.end,
    );

    return {
      rentalType,
      from: formatCalendarDate(window.start),
      to: formatCalendarDate(window.end),
      ranges: ranges.map((range) => ({
        startDate: formatCalendarDate(range.start),
        endDate: formatCalendarDate(range.end),
      })),
    };
  }

  /** La période demandée (bornes incluses) tient-elle entièrement dans un créneau libre ? */
  async isRangeFree(
    propertyId: string,
    rentalType: RentalType,
    requested: CalendarRange,
  ): Promise<boolean> {
    const free = await this.computeFreeRanges(propertyId, rentalType, requested);
    return free.some((range) => range.start <= requested.start && range.end >= requested.end);
  }

  private async computeFreeRanges(
    propertyId: string,
    rentalType: RentalType,
    window: CalendarRange,
  ): Promise<CalendarRange[]> {
    const [windowsCount, availabilities, bookings] = await Promise.all([
      this.prisma.propertyAvailability.count({ where: { propertyId, rentalType } }),
      this.prisma.propertyAvailability.findMany({
        where: {
          propertyId,
          rentalType,
          startDate: { lte: window.end },
          endDate: { gte: window.start },
        },
        orderBy: { startDate: 'asc' },
      }),
      // Un bien occupé l'est quel que soit le type de la réservation
      this.prisma.booking.findMany({
        where: {
          propertyId,
          status: { in: BLOCKING_BOOKING_STATUSES },
          startDate: { lte: window.end },
          endDate: { gte: window.start },
        },
        select: { startDate: true, endDate: true },
      }),
    ]);

    // Aucune période saisie pour ce type : réservable à tout moment
    const open: CalendarRange[] = windowsCount
      ? availabilities.map((availability) => ({
          start: availability.startDate > window.start ? availability.startDate : window.start,
          end: availability.endDate < window.end ? availability.endDate : window.end,
        }))
      : [window];

    return subtractRanges(
      open,
      bookings.map((booking) => ({ start: booking.startDate, end: booking.endDate })),
    );
  }

  private resolveWindow(rentalType: RentalType, from?: string, to?: string): CalendarRange {
    const today = todayCalendarDate();
    const requestedStart = from ? this.parse(from) : today;
    const start = requestedStart > today ? requestedStart : today;
    const end = to
      ? this.parse(to)
      : addDays(addMonths(start, DEFAULT_HORIZON_MONTHS[rentalType]), -1);

    if (end < start || end > addMonths(start, MAX_HORIZON_MONTHS)) {
      throw new HttpError(
        `La période recherchée doit être comprise entre aujourd’hui et ${MAX_HORIZON_MONTHS / 12} ans`,
        HttpStatus.BAD_REQUEST,
        'INVALID_SEARCH_RANGE',
      );
    }
    return { start, end };
  }

  private parse(value: string): Date {
    const date = parseCalendarDate(value);
    if (!date) {
      throw new HttpError(`Date invalide : ${value}`, HttpStatus.BAD_REQUEST, 'INVALID_DATE');
    }
    return date;
  }
}
