import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { HttpError } from '../../config/http.error';
import { RentalType } from '../../../prisma/generated/enums';
import { RentalAvailabilityDto, RentalConfigDto } from './rentals.dto';

/** Relations à inclure pour exposer les modalités de location d'un bien. */
export const RENTAL_INCLUDE = {
  rentalConfigs: { orderBy: { createdAt: 'asc' } },
  availabilities: { orderBy: { startDate: 'asc' } },
} satisfies Prisma.PropertyInclude;

/**
 * Durée minimale d'une période de disponibilité selon le type de location :
 * la date de fin doit être au moins à « début + 1 unité » (elle peut être le jour de départ).
 * Journalière / nocturne : 2 jours ; mensuelle : 1 mois ; annuelle : 1 an.
 */
export const MIN_AVAILABILITY_SPAN: Record<RentalType, { days?: number; months?: number }> = {
  [RentalType.DAILY]: { days: 1 },
  [RentalType.NIGHTLY]: { days: 1 },
  [RentalType.MONTHLY]: { months: 1 },
  [RentalType.YEARLY]: { months: 12 },
};

const MIN_AVAILABILITY_LABEL: Record<RentalType, string> = {
  [RentalType.DAILY]: '2 jours',
  [RentalType.NIGHTLY]: '2 jours',
  [RentalType.MONTHLY]: '1 mois',
  [RentalType.YEARLY]: '1 an',
};

/**
 * Modalités de location d'un bien (journalière, nocturne, mensuelle, annuelle).
 * Chaque modalité porte son prix, sa caution, ses durées et ses fenêtres de disponibilité.
 * Source de vérité unique : le prix/caution du bien en sont dérivés.
 */
@Injectable()
export class RentalConfigService {
  /** Vérifie la cohérence des modalités ; lève une erreur métier explicite sinon. */
  validate(configs: RentalConfigDto[]): void {
    if (!configs.length) {
      throw new HttpError(
        'Au moins une modalité de location est requise',
        HttpStatus.BAD_REQUEST,
        'RENTAL_CONFIG_REQUIRED',
      );
    }

    if (!configs.some((config) => config.isActive !== false)) {
      throw new HttpError(
        'Au moins une modalité de location doit être active',
        HttpStatus.BAD_REQUEST,
        'RENTAL_CONFIG_ACTIVE_REQUIRED',
      );
    }

    const seenTypes = new Set<string>();
    for (const config of configs) {
      if (seenTypes.has(config.rentalType)) {
        throw new HttpError(
          'Chaque type de location ne peut être configuré qu’une seule fois',
          HttpStatus.BAD_REQUEST,
          'RENTAL_TYPE_DUPLICATED',
        );
      }
      seenTypes.add(config.rentalType);

      if (config.minDuration && config.maxDuration && config.maxDuration < config.minDuration) {
        throw new HttpError(
          'La durée maximale doit être supérieure ou égale à la durée minimale',
          HttpStatus.BAD_REQUEST,
          'INVALID_DURATION_RANGE',
        );
      }

      this.validateAvailabilities(config.rentalType, config.availabilities ?? []);
    }
  }

  /** Prix et caution de référence du bien : ceux de la première modalité active. */
  referencePricing(configs: RentalConfigDto[]): { price: number; caution: number } {
    const main = configs.find((config) => config.isActive !== false) ?? configs[0];
    return { price: main.price, caution: main.deposit ?? 0 };
  }

  /** Remplace les modalités et disponibilités d'un bien (à appeler dans une transaction). */
  async replaceForProperty(
    tx: Prisma.TransactionClient,
    propertyId: string,
    configs: RentalConfigDto[],
  ): Promise<void> {
    // Les réservations référencent le type de location, pas la modalité : suppression sans perte d'historique
    await tx.propertyAvailability.deleteMany({ where: { propertyId } });
    await tx.propertyRentalConfig.deleteMany({
      where: { propertyId, rentalType: { notIn: configs.map((config) => config.rentalType) } },
    });

    for (const config of configs) {
      const values = {
        price: config.price,
        deposit: config.deposit ?? 0,
        minDuration: config.minDuration ?? null,
        maxDuration: config.maxDuration ?? null,
        isActive: config.isActive ?? true,
      };
      await tx.propertyRentalConfig.upsert({
        where: { propertyId_rentalType: { propertyId, rentalType: config.rentalType } },
        create: { propertyId, rentalType: config.rentalType, ...values },
        update: values,
      });
    }

    const windows = configs.flatMap((config) =>
      (config.availabilities ?? []).map((availability) => ({
        propertyId,
        rentalType: config.rentalType,
        startDate: this.toCalendarDate(availability.startDate),
        endDate: this.toCalendarDate(availability.endDate),
      })),
    );

    if (windows.length) {
      await tx.propertyAvailability.createMany({ data: windows });
    }
  }

  private validateAvailabilities(
    rentalType: RentalType,
    availabilities: RentalAvailabilityDto[],
  ): void {
    const ranges = availabilities
      .map((availability) => ({
        start: this.toCalendarDate(availability.startDate),
        end: this.toCalendarDate(availability.endDate),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    ranges.forEach((range, index) => {
      if (range.end < range.start) {
        throw new HttpError(
          'La date de fin doit être postérieure ou égale à la date de début',
          HttpStatus.BAD_REQUEST,
          'INVALID_AVAILABILITY_RANGE',
        );
      }
      if (range.end < this.minAvailabilityEnd(rentalType, range.start)) {
        throw new HttpError(
          `Une période de disponibilité doit couvrir au moins ${MIN_AVAILABILITY_LABEL[rentalType]} pour ce type de location`,
          HttpStatus.BAD_REQUEST,
          'AVAILABILITY_TOO_SHORT',
        );
      }
      const previous = ranges[index - 1];
      if (previous && range.start <= previous.end) {
        throw new HttpError(
          'Les périodes de disponibilité d’une même modalité ne doivent pas se chevaucher',
          HttpStatus.BAD_REQUEST,
          'AVAILABILITY_OVERLAP',
        );
      }
    });
  }

  /** Date de fin minimale : début + 1 unité, ramenée au dernier jour du mois si besoin (31/01 → 28/02). */
  private minAvailabilityEnd(rentalType: RentalType, start: Date): Date {
    const { days = 0, months = 0 } = MIN_AVAILABILITY_SPAN[rentalType];
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + months;
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(start.getUTCDate(), lastDayOfMonth) + days;
    return new Date(Date.UTC(year, month, day));
  }

  /** Convertit AAAA-MM-JJ en date UTC minuit ; rejette les dates impossibles (ex. 2026-02-30). */
  private toCalendarDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new HttpError(`Date invalide : ${value}`, HttpStatus.BAD_REQUEST, 'INVALID_DATE');
    }
    return date;
  }
}
