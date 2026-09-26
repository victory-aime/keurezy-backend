import { RentalConfigService } from './rental-config.service';
import { RentalConfigDto } from './rentals.dto';
import { HttpError } from '../../config/http.error';
import { RentalType } from '../../../prisma/generated/enums';

describe('RentalConfigService', () => {
  const service = new RentalConfigService();

  const monthly: RentalConfigDto = {
    rentalType: RentalType.MONTHLY,
    price: 150000,
    deposit: 300000,
    minDuration: 1,
    maxDuration: 12,
  };

  const errorCode = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
    }
    return null;
  };

  describe('validate', () => {
    it('accepte des modalités cohérentes', () => {
      expect(() =>
        service.validate([
          monthly,
          {
            rentalType: RentalType.NIGHTLY,
            price: 25000,
            availabilities: [
              { startDate: '2026-08-01', endDate: '2026-08-04' },
              { startDate: '2026-08-11', endDate: '2026-08-30' },
            ],
          },
        ]),
      ).not.toThrow();
    });

    it('exige au moins une modalité active', () => {
      expect(errorCode(() => service.validate([]))).toBe('RENTAL_CONFIG_REQUIRED');
      expect(errorCode(() => service.validate([{ ...monthly, isActive: false }]))).toBe(
        'RENTAL_CONFIG_ACTIVE_REQUIRED',
      );
    });

    it('refuse un même type configuré deux fois', () => {
      expect(errorCode(() => service.validate([monthly, monthly]))).toBe('RENTAL_TYPE_DUPLICATED');
    });

    it('refuse une durée maximale inférieure à la minimale', () => {
      expect(
        errorCode(() => service.validate([{ ...monthly, minDuration: 6, maxDuration: 3 }])),
      ).toBe('INVALID_DURATION_RANGE');
    });

    it('refuse des périodes inversées, chevauchantes ou des dates impossibles', () => {
      const withWindows = (availabilities: RentalConfigDto['availabilities']) => () =>
        service.validate([{ ...monthly, availabilities }]);

      expect(errorCode(withWindows([{ startDate: '2026-09-10', endDate: '2026-08-01' }]))).toBe(
        'INVALID_AVAILABILITY_RANGE',
      );
      expect(
        errorCode(
          withWindows([
            { startDate: '2026-08-01', endDate: '2026-09-01' },
            { startDate: '2026-09-01', endDate: '2026-10-01' },
          ]),
        ),
      ).toBe('AVAILABILITY_OVERLAP');
      expect(errorCode(withWindows([{ startDate: '2026-02-30', endDate: '2026-03-30' }]))).toBe(
        'INVALID_DATE',
      );
    });

    it('impose une durée minimale de période selon le type de location', () => {
      const window = (rentalType: RentalType, startDate: string, endDate: string) => () =>
        service.validate([{ ...monthly, rentalType, availabilities: [{ startDate, endDate }] }]);

      // Journalière / nocturne : au moins 2 jours (le second peut être le jour de départ)
      expect(errorCode(window(RentalType.NIGHTLY, '2026-09-26', '2026-09-26'))).toBe(
        'AVAILABILITY_TOO_SHORT',
      );
      expect(errorCode(window(RentalType.DAILY, '2026-09-26', '2026-09-27'))).toBeNull();

      // Mensuelle : au moins 1 mois
      expect(errorCode(window(RentalType.MONTHLY, '2026-09-26', '2026-09-28'))).toBe(
        'AVAILABILITY_TOO_SHORT',
      );
      expect(errorCode(window(RentalType.MONTHLY, '2026-09-26', '2026-10-26'))).toBeNull();
      expect(errorCode(window(RentalType.MONTHLY, '2026-01-31', '2026-02-28'))).toBeNull();

      // Annuelle : au moins 1 an
      expect(errorCode(window(RentalType.YEARLY, '2026-09-26', '2027-09-25'))).toBe(
        'AVAILABILITY_TOO_SHORT',
      );
      expect(errorCode(window(RentalType.YEARLY, '2026-09-26', '2027-09-26'))).toBeNull();
    });
  });

  it('dérive le prix et la caution du bien de la première modalité active', () => {
    expect(
      service.referencePricing([
        { ...monthly, isActive: false },
        { rentalType: RentalType.DAILY, price: 20000, deposit: 50000 },
      ]),
    ).toEqual({ price: 20000, caution: 50000 });
  });

  it('remplace modalités et disponibilités en dates calendaires UTC', async () => {
    const tx = {
      propertyAvailability: { deleteMany: jest.fn(), createMany: jest.fn() },
      propertyRentalConfig: { deleteMany: jest.fn(), upsert: jest.fn() },
    };

    await service.replaceForProperty(tx as never, 'property-1', [
      { ...monthly, availabilities: [{ startDate: '2026-08-01', endDate: '2026-08-30' }] },
    ]);

    expect(tx.propertyRentalConfig.deleteMany).toHaveBeenCalledWith({
      where: { propertyId: 'property-1', rentalType: { notIn: [RentalType.MONTHLY] } },
    });
    expect(tx.propertyRentalConfig.upsert).toHaveBeenCalledTimes(1);
    expect(tx.propertyAvailability.createMany).toHaveBeenCalledWith({
      data: [
        {
          propertyId: 'property-1',
          rentalType: RentalType.MONTHLY,
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-30T00:00:00.000Z'),
        },
      ],
    });
  });
});
