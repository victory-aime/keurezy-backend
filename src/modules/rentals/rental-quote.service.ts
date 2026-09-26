import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { RentalType } from '../../../prisma/generated/enums';
import { HttpError } from '../../config/http.error';
import { RentalAvailabilityService } from './rental-availability.service';
import {
  addDays,
  formatCalendarDate,
  parseCalendarDate,
  rentalLastDay,
  todayCalendarDate,
} from './calendar-date';

export interface RentalQuoteRequest {
  rentalType: RentalType;
  startDate: string;
  /** Nombre d'unités du type : jours, nuits, mois ou années */
  duration: number;
}

export interface RentalQuote {
  rentalType: RentalType;
  startDate: string;
  /** Dernier jour occupé (inclus) */
  endDate: string;
  /** Jour de libération du bien (lendemain du dernier jour occupé) */
  checkOutDate: string;
  duration: number;
  unitPrice: number;
  totalAmount: number;
  depositAmount: number;
}

/**
 * Devis d'une location : vérifie durée et disponibilité, puis calcule le montant.
 * Source de vérité du prix : les clients affichent ce devis sans le recalculer.
 */
@Injectable()
export class RentalQuoteService {
  constructor(private readonly availability: RentalAvailabilityService) {}

  async quote(propertyId: string, request: RentalQuoteRequest): Promise<RentalQuote> {
    const { rentalType, duration } = request;
    const config = await this.availability.getActiveConfig(propertyId, rentalType);

    if (duration < (config.minDuration ?? 1)) {
      throw new HttpError(
        `La durée minimale pour cette location est de ${config.minDuration ?? 1}`,
        HttpStatus.BAD_REQUEST,
        'DURATION_TOO_SHORT',
      );
    }
    if (config.maxDuration && duration > config.maxDuration) {
      throw new HttpError(
        `La durée maximale pour cette location est de ${config.maxDuration}`,
        HttpStatus.BAD_REQUEST,
        'DURATION_TOO_LONG',
      );
    }

    const start = parseCalendarDate(request.startDate);
    if (!start) {
      throw new HttpError(
        `Date invalide : ${request.startDate}`,
        HttpStatus.BAD_REQUEST,
        'INVALID_DATE',
      );
    }
    if (start < todayCalendarDate()) {
      throw new HttpError(
        'La date de début ne peut pas être dans le passé',
        HttpStatus.BAD_REQUEST,
        'DATE_IN_PAST',
      );
    }

    const end = rentalLastDay(rentalType, start, duration);
    const isFree = await this.availability.isRangeFree(propertyId, rentalType, { start, end });
    if (!isFree) {
      throw new HttpError(
        'Ces dates ne sont pas disponibles pour ce bien',
        HttpStatus.CONFLICT,
        'SLOT_UNAVAILABLE',
      );
    }

    return {
      rentalType,
      startDate: formatCalendarDate(start),
      endDate: formatCalendarDate(end),
      checkOutDate: formatCalendarDate(addDays(end, 1)),
      duration,
      unitPrice: config.price.toNumber(),
      totalAmount: config.price.mul(new Prisma.Decimal(duration)).toNumber(),
      depositAmount: config.deposit.toNumber(),
    };
  }
}
