import { PropertyService } from './property.service';
import { LandService } from '../land/land.service';
import { HttpError } from '../../config/http.error';

// Dépendances mockées : évite de charger Better Auth (ESM) dans Jest
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));
jest.mock('../rentals/rental-config.service', () => ({
  RentalConfigService: class {},
  RENTAL_INCLUDE: {},
}));

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

describe('PropertyService — fermeture et suppression', () => {
  const prisma = {
    property: { findUnique: jest.fn(), delete: jest.fn() },
    annonce: { updateMany: jest.fn() },
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new PropertyService(
    prisma as never,
    agencyService as never,
    {} as never,
    {} as never,
  );

  const property = (counts: { bookings?: number; conversations?: number }) => ({
    id: 'p1',
    agencyId: 'A',
    _count: { bookings: counts.bookings ?? 0, conversations: counts.conversations ?? 0 },
  });

  beforeEach(() => jest.resetAllMocks());

  it("refuse l'accès à un bien d'une autre agence (contrôle sur l'agence du bien)", async () => {
    prisma.property.findUnique.mockResolvedValue(property({}));
    agencyService.agencyAccessControl.mockRejectedValue(
      new HttpError('x', 403, 'AGENCY_ACCESS_DENIED'),
    );

    await expect(errorCodeOf(service.deleteProperty('p1', 'staff-1'))).resolves.toBe(
      'AGENCY_ACCESS_DENIED',
    );
    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('A', 'staff-1');
    expect(prisma.property.delete).not.toHaveBeenCalled();
  });

  it('refuse la suppression d’un bien qui a des réservations', async () => {
    prisma.property.findUnique.mockResolvedValue(property({ bookings: 1 }));
    await expect(errorCodeOf(service.deleteProperty('p1', 'owner-1'))).resolves.toBe(
      'PROPERTY_HAS_BOOKINGS',
    );
    expect(prisma.property.delete).not.toHaveBeenCalled();
  });

  it('refuse la suppression d’un bien qui a des discussions (historique du chat)', async () => {
    prisma.property.findUnique.mockResolvedValue(property({ conversations: 2 }));
    await expect(errorCodeOf(service.deleteProperty('p1', 'owner-1'))).resolves.toBe(
      'PROPERTY_IN_USE',
    );
  });

  it('supprime un bien sans historique', async () => {
    prisma.property.findUnique.mockResolvedValue(property({}));
    await service.deleteProperty('p1', 'owner-1');
    expect(prisma.property.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('la fermeture dépublie les annonces en ligne du bien', async () => {
    prisma.property.findUnique.mockResolvedValue(property({}));
    await service.closeProperty('p1', 'owner-1');
    expect(prisma.annonce.updateMany).toHaveBeenCalledWith({
      where: { propertyId: 'p1', status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });
  });
});

describe('LandService.deleteLand', () => {
  const prisma = { land: { findUnique: jest.fn(), delete: jest.fn() } };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new LandService(prisma as never, agencyService as never, {} as never);

  beforeEach(() => jest.resetAllMocks());

  it('refuse la suppression d’un terrain qui porte des bâtiments ou des villas', async () => {
    prisma.land.findUnique.mockResolvedValue({
      id: 'l1',
      agencyId: 'A',
      _count: { batiments: 1, villa: 0 },
    });
    await expect(errorCodeOf(service.deleteLand('l1', 'owner-1'))).resolves.toBe(
      'LAND_HAS_BUILDINGS',
    );
    expect(prisma.land.delete).not.toHaveBeenCalled();
  });

  it('supprime un terrain nu de l’agence', async () => {
    prisma.land.findUnique.mockResolvedValue({
      id: 'l1',
      agencyId: 'A',
      _count: { batiments: 0, villa: 0 },
    });
    await service.deleteLand('l1', 'owner-1');
    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('A', 'owner-1');
    expect(prisma.land.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
  });
});

describe('PropertyService.getMonthlyRevenue', () => {
  const prisma = { booking: { findMany: jest.fn() } };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new PropertyService(
    prisma as never,
    agencyService as never,
    {} as never,
    {} as never,
  );

  it('range les montants par mois de début : terminées = reçu, confirmées = restant', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { startDate: new Date('2026-01-10'), status: 'COMPLETED', totalAmount: 100000 },
      { startDate: new Date('2026-01-25'), status: 'COMPLETED', totalAmount: 50000 },
      { startDate: new Date('2026-03-02'), status: 'CONFIRMED', totalAmount: 80000 },
    ]);

    const revenue = await service.getMonthlyRevenue({ agencyId: 'A', year: 2026 }, 'owner-1');

    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('A', 'owner-1');
    expect(revenue).toHaveLength(12);
    expect(revenue[0]).toEqual({ month: '2026-01', receivedAmount: 150000, remainingAmount: 0 });
    expect(revenue[2]).toEqual({ month: '2026-03', receivedAmount: 0, remainingAmount: 80000 });
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          agencyId: 'A',
          status: { in: ['COMPLETED', 'CONFIRMED'] },
          startDate: { gte: new Date(Date.UTC(2026, 0, 1)), lt: new Date(Date.UTC(2027, 0, 1)) },
        },
      }),
    );
  });
});
