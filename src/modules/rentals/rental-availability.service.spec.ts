import { RentalAvailabilityService } from './rental-availability.service';
import { RentalQuoteService } from './rental-quote.service';
import { addDays, formatCalendarDate, subtractRanges, todayCalendarDate } from './calendar-date';
import { HttpError } from '../../config/http.error';
import { Prisma } from '../../../prisma/generated/client';
import { BookingStatus, RentalType } from '../../../prisma/generated/enums';

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
// Dates relatives à aujourd'hui : les créneaux passés sont toujours écartés
const inDays = (days: number) => formatCalendarDate(addDays(todayCalendarDate(), days));

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
  }
  return null;
};

describe('subtractRanges', () => {
  it('découpe une disponibilité autour d’une réservation (bornes incluses)', () => {
    // Exemple d'AGENTS.md : 01/08 → 30/08 moins 05/08 → 10/08
    expect(
      subtractRanges(
        [{ start: d('2026-08-01'), end: d('2026-08-30') }],
        [{ start: d('2026-08-05'), end: d('2026-08-10') }],
      ),
    ).toEqual([
      { start: d('2026-08-01'), end: d('2026-08-04') },
      { start: d('2026-08-11'), end: d('2026-08-30') },
    ]);
  });

  it('gère les réservations en bordure, englobantes ou disjointes', () => {
    const range = [{ start: d('2026-08-01'), end: d('2026-08-10') }];
    expect(subtractRanges(range, [{ start: d('2026-07-25'), end: d('2026-08-01') }])).toEqual([
      { start: d('2026-08-02'), end: d('2026-08-10') },
    ]);
    expect(subtractRanges(range, [{ start: d('2026-07-01'), end: d('2026-09-01') }])).toEqual([]);
    expect(subtractRanges(range, [{ start: d('2026-09-01'), end: d('2026-09-05') }])).toEqual(
      range,
    );
  });
});

describe('RentalAvailabilityService & RentalQuoteService', () => {
  const nightly = {
    propertyId: 'property-1',
    rentalType: RentalType.NIGHTLY,
    price: new Prisma.Decimal(25000),
    deposit: new Prisma.Decimal(50000),
    minDuration: 2,
    maxDuration: 14,
    isActive: true,
  };

  const setup = ({
    config = nightly as typeof nightly | null,
    windows = [] as { startDate: Date; endDate: Date }[],
    bookings = [] as { startDate: Date; endDate: Date }[],
  } = {}) => {
    const prisma = {
      propertyRentalConfig: { findUnique: jest.fn().mockResolvedValue(config) },
      propertyAvailability: {
        count: jest.fn().mockResolvedValue(windows.length),
        findMany: jest.fn().mockResolvedValue(windows),
      },
      booking: { findMany: jest.fn().mockResolvedValue(bookings) },
    };
    const availability = new RentalAvailabilityService(prisma as never);
    return { prisma, availability, quote: new RentalQuoteService(availability) };
  };

  it('refuse un type de location non proposé ou suspendu', async () => {
    const { availability } = setup({ config: { ...nightly, isActive: false } });
    expect(await errorCode(availability.getFreeRanges('property-1', RentalType.NIGHTLY))).toBe(
      'RENTAL_TYPE_NOT_OFFERED',
    );
  });

  it('ne bloque que sur les réservations confirmées ou terminées', async () => {
    const { prisma, availability } = setup();
    await availability.getFreeRanges('property-1', RentalType.NIGHTLY);

    const [[query]] = prisma.booking.findMany.mock.calls as [[{ where: { status: unknown } }]];
    expect(query.where.status).toEqual({
      in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
    });
  });

  it('écarte les créneaux trop courts pour la durée minimale', async () => {
    const { availability } = setup({
      bookings: [{ startDate: d(inDays(11)), endDate: d(inDays(20)) }],
    });

    const result = await availability.getFreeRanges(
      'property-1',
      RentalType.NIGHTLY,
      inDays(10),
      inDays(30),
    );

    // Le jour isolé (J+10) ne permet pas 2 nuits ; J+21 → J+30 reste proposé
    expect(result.ranges).toEqual([{ startDate: inDays(21), endDate: inDays(30) }]);
  });

  it('calcule un devis sur des dates libres', async () => {
    const { quote } = setup({ windows: [{ startDate: d(inDays(1)), endDate: d(inDays(60)) }] });

    await expect(
      quote.quote('property-1', {
        rentalType: RentalType.NIGHTLY,
        startDate: inDays(5),
        duration: 3,
      }),
    ).resolves.toEqual({
      rentalType: RentalType.NIGHTLY,
      startDate: inDays(5),
      endDate: inDays(7),
      checkOutDate: inDays(8),
      duration: 3,
      unitPrice: 25000,
      totalAmount: 75000,
      depositAmount: 50000,
    });
  });

  it('refuse un devis hors durée, dans le passé ou sur des dates prises', async () => {
    const { quote } = setup({
      bookings: [{ startDate: d(inDays(6)), endDate: d(inDays(6)) }],
    });
    const ask = (startDate: string, duration: number) =>
      errorCode(quote.quote('property-1', { rentalType: RentalType.NIGHTLY, startDate, duration }));

    expect(await ask(inDays(20), 1)).toBe('DURATION_TOO_SHORT');
    expect(await ask(inDays(20), 15)).toBe('DURATION_TOO_LONG');
    expect(await ask(inDays(-1), 3)).toBe('DATE_IN_PAST');
    expect(await ask(inDays(5), 3)).toBe('SLOT_UNAVAILABLE');
  });
});
