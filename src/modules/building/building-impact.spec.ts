import { BuildingService } from './building.service';
import { HttpError } from '../../config/http.error';

// Dépendances mockées : évite de charger Better Auth (ESM) dans Jest
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

describe('BuildingService — impact et suppression', () => {
  const prisma = {
    batiment: { findUnique: jest.fn(), delete: jest.fn() },
    property: { findMany: jest.fn() },
    annonce: { count: jest.fn() },
    booking: { count: jest.fn() },
    conversation: { count: jest.fn() },
    visit: { count: jest.fn() },
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new BuildingService(prisma as never, agencyService as never, {} as never);

  /** Bâtiment de deux biens ; `history` : réservations comptées sur l'ensemble de ses biens. */
  const building = (history = 0) => {
    prisma.batiment.findUnique.mockResolvedValue({ id: 'b1', agencyId: 'A' });
    prisma.property.findMany.mockResolvedValue([
      { id: 'p1', title: 'Appartement 1' },
      { id: 'p2', title: 'Appartement 2' },
    ]);
    prisma.annonce.count.mockResolvedValue(0);
    prisma.booking.count.mockResolvedValue(history);
    prisma.conversation.count.mockResolvedValue(0);
    prisma.visit.count.mockResolvedValue(0);
  };

  beforeEach(() => jest.resetAllMocks());

  it('liste les biens supprimés avec le bâtiment et agrège leur historique', async () => {
    building(2);
    const impact = await service.getBuildingImpact('b1', 'owner-1');

    expect(agencyService.agencyAccessControl).toHaveBeenCalledWith('A', 'owner-1');
    expect(impact.properties).toEqual([
      { id: 'p1', title: 'Appartement 1' },
      { id: 'p2', title: 'Appartement 2' },
    ]);
    expect(impact.bookings.total).toBe(2);
    expect(impact.canDelete).toBe(false);
    // L'historique est compté sur tous les biens du bâtiment
    expect(prisma.booking.count).toHaveBeenCalledWith({
      where: { property: { batimentId: 'b1' } },
    });
  });

  it("refuse la suppression d'un bâtiment dont un bien a un historique", async () => {
    building(1);
    await expect(errorCodeOf(service.deleteBuilding('b1', 'owner-1'))).resolves.toBe(
      'BUILDING_IN_USE',
    );
    expect(prisma.batiment.delete).not.toHaveBeenCalled();
  });

  it('supprime un bâtiment dont les biens sont sans historique', async () => {
    building(0);
    await service.deleteBuilding('b1', 'owner-1');
    expect(prisma.batiment.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
  });
});
