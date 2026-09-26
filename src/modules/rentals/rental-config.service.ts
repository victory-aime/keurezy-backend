import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PropertyRentalConfig } from '../../../prisma/generated/client';
import { HttpError } from '../../config/http.error';
import { RentalType } from '../../../prisma/generated/enums';
import { RentalAvailabilityDto, RentalConfigDto } from './rentals.dto';
import { addRentalUnits, parseCalendarDate } from './calendar-date';

/** Offre de location publique : modalité active, montants en nombres. */
export interface PublicRentalOffer {
  rentalType: RentalType;
  price: number;
  deposit: number;
  minDuration: number | null;
  maxDuration: number | null;
}

/** Modalités actives d'un bien, dans l'ordre canonique des types (enum Postgres). */
export const PUBLIC_RENTAL_OFFERS_INCLUDE = {
  where: { isActive: true },
  orderBy: { rentalType: 'asc' },
} satisfies Prisma.Property$rentalConfigsArgs;

export const toPublicRentalOffer = (config: PropertyRentalConfig): PublicRentalOffer => ({
  rentalType: config.rentalType,
  price: config.price.toNumber(),
  deposit: config.deposit.toNumber(),
  minDuration: config.minDuration,
  maxDuration: config.maxDuration,
});

/** Relations à inclure pour exposer les modalités de location d'un bien. */
export const RENTAL_INCLUDE = {
  rentalConfigs: { orderBy: { createdAt: 'asc' } },
  availabilities: { orderBy: { startDate: 'asc' } },
} satisfies Prisma.PropertyInclude;

/**
 * Durée minimale d'une période de disponibilité : la date de fin doit être au moins
 * à « début + 1 unité » (elle peut être le jour de départ).
 * Journalière / nocturne : 2 jours ; mensuelle : 1 mois ; annuelle : 1 an.
 */
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
      if (range.end < addRentalUnits(rentalType, range.start, 1)) {
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

  /** Convertit AAAA-MM-JJ en date UTC minuit ; rejette les dates impossibles (ex. 2026-02-30). */
  private toCalendarDate(value: string): Date {
    const date = parseCalendarDate(value);
    if (!date) {
      throw new HttpError(`Date invalide : ${value}`, HttpStatus.BAD_REQUEST, 'INVALID_DATE');
    }
    return date;
  }
}
