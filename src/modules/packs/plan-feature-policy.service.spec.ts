import { PlanFeaturePolicyService } from './plan-feature-policy.service';
import { HttpError } from '../../config/http.error';
import { toUsage } from './plan-feature-policy.service';

describe('PlanFeaturePolicyService', () => {
  const prisma = {
    subscription: { findUnique: jest.fn() },
    property: { count: jest.fn() },
    land: { count: jest.fn() },
    batiment: { count: jest.fn() },
    staff: { count: jest.fn() },
    invitation: { count: jest.fn() },
    annonce: { count: jest.fn() },
  };
  const service = new PlanFeaturePolicyService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('compte les biens actifs (propriétés, terrains, bâtiments) contre une seule limite', async () => {
    prisma.property.count.mockResolvedValue(2);
    prisma.land.count.mockResolvedValue(3);
    prisma.batiment.count.mockResolvedValue(1);
    await expect(service.countPropertyAssets('A')).resolves.toBe(6);
    expect(prisma.land.count).toHaveBeenCalledWith({ where: { agencyId: 'A', isActive: true } });
  });

  it('ne compte que les membres actifs dans les places utilisateurs', async () => {
    prisma.staff.count.mockResolvedValue(1);
    prisma.invitation.count.mockResolvedValue(0);
    await service.countUserSeats('A');
    expect(prisma.staff.count).toHaveBeenCalledWith({ where: { agencyId: 'A', isActive: true } });
  });

  it("indique s'il reste une place pour un élément de plus", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      plan: {
        id: 'p',
        planFeatures: [{ enabled: true, limit: 2, feature: { name: 'publish_properties' } }],
      },
    });
    prisma.annonce.count.mockResolvedValue(1);
    await expect(service.hasRoomFor('A', 'publish_properties')).resolves.toBe(true);
    prisma.annonce.count.mockResolvedValue(2);
    await expect(service.hasRoomFor('A', 'publish_properties')).resolves.toBe(false);
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

  it("ne compte que les annonces en ligne de l'agence", async () => {
    prisma.annonce.count.mockResolvedValue(4);
    await expect(service.countAnnonces('A')).resolves.toBe(4);
    expect(prisma.annonce.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', property: { agencyId: 'A' } },
    });
  });
});

describe('toUsage', () => {
  const check = (currentUsage: number, capacity: number | null) => ({
    feature: 'manage_users',
    enabled: true,
    capacity,
    currentUsage,
    remaining: capacity === null ? null : Math.max(capacity - currentUsage, 0),
    allowed: capacity === null || currentUsage < capacity,
  });

  it('reste OK sous 80 %', () => {
    expect(toUsage(check(79, 100))).toEqual({
      feature: 'manage_users',
      used: 79,
      limit: 100,
      remaining: 21,
      percentage: 79,
      state: 'OK',
    });
  });

  it('signale NEAR_LIMIT dès 80 %', () => {
    expect(toUsage(check(4, 5)).state).toBe('NEAR_LIMIT');
  });

  it('signale REACHED à la limite', () => {
    expect(toUsage(check(5, 5))).toMatchObject({ remaining: 0, percentage: 100, state: 'REACHED' });
  });

  it('plafonne le pourcentage à 100 quand la consommation dépasse la limite', () => {
    expect(toUsage(check(8, 1))).toMatchObject({ remaining: 0, percentage: 100, state: 'REACHED' });
  });

  it('renvoie UNLIMITED sans pourcentage pour une limite nulle', () => {
    expect(toUsage(check(12, null))).toMatchObject({
      limit: null,
      remaining: null,
      percentage: null,
      state: 'UNLIMITED',
    });
  });
});
