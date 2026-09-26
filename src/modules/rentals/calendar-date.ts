import { RentalType } from '../../../prisma/generated/enums';

/**
 * Dates calendaires (sans heure) du domaine location.
 * Stockées en @db.Date et manipulées en UTC minuit pour éviter tout décalage de fuseau.
 */

// Format échangé avec les clients : AAAA-MM-JJ
export const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarRange {
  start: Date;
  end: Date; // inclus
}

/** Unité de location de chaque type : un jour, une nuit, un mois, un an. */
const RENTAL_UNIT: Record<RentalType, { days?: number; months?: number }> = {
  [RentalType.DAILY]: { days: 1 },
  [RentalType.NIGHTLY]: { days: 1 },
  [RentalType.MONTHLY]: { months: 1 },
  [RentalType.YEARLY]: { months: 12 },
};

/** AAAA-MM-JJ → Date UTC minuit ; null pour une date impossible (ex. 2026-02-30). */
export const parseCalendarDate = (value: string): Date | null => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || formatCalendarDate(date) !== value ? null : date;
};

export const formatCalendarDate = (date: Date): string => date.toISOString().slice(0, 10);

export const todayCalendarDate = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export const addDays = (date: Date, days: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));

/** Ajoute des mois en restant dans le mois cible (31/01 + 1 mois → 28/02). */
export const addMonths = (date: Date, months: number): Date => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfMonth)));
};

/** Date située `count` unités de location après `start`. */
export const addRentalUnits = (rentalType: RentalType, start: Date, count: number): Date => {
  const { days = 0, months = 0 } = RENTAL_UNIT[rentalType];
  return addDays(addMonths(start, months * count), days * count);
};

/** Dernier jour occupé (inclus) d'une location de `count` unités commençant à `start`. */
export const rentalLastDay = (rentalType: RentalType, start: Date, count: number): Date =>
  addDays(addRentalUnits(rentalType, start, count), -1);

/** Retire des plages bloquées (bornes incluses) d'un ensemble de plages triées et disjointes. */
export const subtractRanges = (
  ranges: CalendarRange[],
  blocked: CalendarRange[],
): CalendarRange[] =>
  blocked.reduce<CalendarRange[]>(
    (free, block) =>
      free.flatMap((range) => {
        if (block.end < range.start || block.start > range.end) return [range];
        const pieces: CalendarRange[] = [];
        if (block.start > range.start) {
          pieces.push({ start: range.start, end: addDays(block.start, -1) });
        }
        if (block.end < range.end) {
          pieces.push({ start: addDays(block.end, 1), end: range.end });
        }
        return pieces;
      }),
    ranges,
  );
