import { PlanFeaturePolicyService } from './plan-feature-policy.service';
import { HttpError } from '../../config/http.error';

describe('PlanFeaturePolicyService', () => {
  const prisma = {
    subscription: { findUnique: jest.fn() },
    property: { count: jest.fn() },
    land: { count: jest.fn() },
    batiment: { count: jest.fn() },
    staff: { count: jest.fn() },
    invitation: { count: jest.fn() },
  };
  const service = new PlanFeaturePolicyService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('compte propriétés, terrains et bâtiments contre une seule limite de biens', async () => {
    prisma.property.count.mockResolvedValue(2);
    prisma.land.count.mockResolvedValue(3);
    prisma.batiment.count.mockResolvedValue(1);
    await expect(service.countPropertyAssets('A')).resolves.toBe(6);
  });

  it('compte les invitations en attente non expirées dans les places utilisateurs', async () => {
    prisma.staff.count.mockResolvedValue(2);
    prisma.invitation.count.mockResolvedValue(1);
    await expect(service.countUserSeats('A')).resolves.toBe(3);
    expect(prisma.invitation.count).toHaveBeenCalledWith({
      where: { agencyId: 'A', status: 'PENDING', expiresAt: { gt: expect.any(Date) } },
    });
  });

  it("refuse le contexte d'un abonnement inactif", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'INACTIVE',
      plan: { id: 'p', planFeatures: [] },
    });
    await expect(service.getAgencyFeatureContext('A')).rejects.toBeInstanceOf(HttpError);
  });

  it("charge les features d'un abonnement actif", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      plan: { id: 'p', planFeatures: [{ enabled: true, limit: 6, feature: { name: 'f' } }] },
    });
    const context = await service.getAgencyFeatureContext('A');
    expect(service.checkCapacity(context, 'f', 6).allowed).toBe(false);
    expect(service.checkCapacity(context, 'f', 5).allowed).toBe(true);
  });
});
