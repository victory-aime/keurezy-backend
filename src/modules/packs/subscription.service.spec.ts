import { SubscriptionService } from './subscription.service';
import { PlanFeaturePolicyService } from './plan-feature-policy.service';
import { HttpError } from '../../config/http.error';

// AgencyService charge Better Auth (ESM) : seul agencyAccessControl est utilisé ici
jest.mock('../agency/agency.service', () => ({ AgencyService: class {} }));

/** Code d'erreur métier porté par la réponse d'une HttpError */
const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

describe('SubscriptionService.getOverview', () => {
  const prisma = {
    subscription: { findUnique: jest.fn() },
    feature: { findMany: jest.fn() },
    property: { count: jest.fn() },
    land: { count: jest.fn() },
    batiment: { count: jest.fn() },
    staff: { count: jest.fn() },
    invitation: { count: jest.fn() },
    annonce: { count: jest.fn() },
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new SubscriptionService(
    prisma as never,
    agencyService as never,
    new PlanFeaturePolicyService(prisma as never),
  );

  const standardSubscription = {
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    price: { toString: () => '10000' }, // Decimal Prisma
    currency: 'XOF',
    currentPeriodStart: new Date('2026-09-30T00:00:00Z'),
    currentPeriodEnd: new Date('2026-10-30T00:00:00Z'),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    plan: {
      id: 'plan-standard',
      name: 'STANDARD_SUB',
      planFeatures: [
        { enabled: true, limit: 20, feature: { name: 'manage_properties' } },
        { enabled: true, limit: 20, feature: { name: 'publish_properties' } },
        { enabled: true, limit: 5, feature: { name: 'manage_users' } },
        { enabled: true, limit: null, feature: { name: 'annonce_stats' } },
      ],
    },
  };

  const commercialFeatures = [
    { name: 'manage_properties', category: 'PROPERTIES', description: null },
    { name: 'publish_properties', category: 'ANNONCES', description: null },
    { name: 'manage_users', category: 'USERS', description: null },
    { name: 'manage_accounting', category: 'ACCOUNTING', description: 'Comptabilité' },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.feature.findMany.mockResolvedValue(commercialFeatures);
    prisma.property.count.mockResolvedValue(10);
    prisma.land.count.mockResolvedValue(3);
    prisma.batiment.count.mockResolvedValue(1);
    prisma.annonce.count.mockResolvedValue(19);
    prisma.staff.count.mockResolvedValue(5);
    prisma.invitation.count.mockResolvedValue(0);
  });

  it("refuse le staff : l'abonnement et ses montants sont réservés au propriétaire", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    await expect(errorCodeOf(service.getOverview('A', 'staff-1'))).resolves.toBe('OWNER_ONLY');
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('expose la souscription avec un prix numérique', async () => {
    prisma.subscription.findUnique.mockResolvedValue(standardSubscription);
    const overview = await service.getOverview('A', 'owner-1');
    expect(overview.subscription).toEqual({
      status: 'ACTIVE',
      plan: { id: 'plan-standard', name: 'STANDARD_SUB' },
      billingCycle: 'MONTHLY',
      price: 10000,
      currency: 'XOF',
      currentPeriodStart: standardSubscription.currentPeriodStart,
      currentPeriodEnd: standardSubscription.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
  });

  it('calcule la consommation avec les compteurs qui bloquent la création', async () => {
    prisma.subscription.findUnique.mockResolvedValue(standardSubscription);
    const { usage } = await service.getOverview('A', 'owner-1');
    expect(usage).toEqual([
      {
        feature: 'manage_properties',
        used: 14,
        limit: 20,
        remaining: 6,
        percentage: 70,
        state: 'OK',
      },
      {
        feature: 'publish_properties',
        used: 19,
        limit: 20,
        remaining: 1,
        percentage: 95,
        state: 'NEAR_LIMIT',
      },
      {
        feature: 'manage_users',
        used: 5,
        limit: 5,
        remaining: 0,
        percentage: 100,
        state: 'REACHED',
      },
    ]);
  });

  it('marque les fonctionnalités incluses et celles disponibles avec un autre plan', async () => {
    prisma.subscription.findUnique.mockResolvedValue(standardSubscription);
    const { features } = await service.getOverview('A', 'owner-1');
    expect(features).toContainEqual({
      name: 'manage_users',
      category: 'USERS',
      description: null,
      limit: 5,
      included: true,
    });
    expect(features).toContainEqual({
      name: 'manage_accounting',
      category: 'ACCOUNTING',
      description: 'Comptabilité',
      limit: null,
      included: false,
    });
  });

  it("n'échoue pas sur un abonnement inactif : la page doit pouvoir l'afficher", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      ...standardSubscription,
      status: 'INACTIVE',
    });
    const overview = await service.getOverview('A', 'owner-1');
    expect(overview.subscription?.status).toBe('INACTIVE');
    expect(overview.usage).toHaveLength(3);
  });

  it("renvoie subscription null quand l'agence n'a aucune souscription", async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    const overview = await service.getOverview('A', 'owner-1');
    expect(overview.subscription).toBeNull();
    expect(overview.usage).toEqual([]);
    expect(overview.features.every((f) => !f.included)).toBe(true);
  });
});

describe('SubscriptionService.expireEndedPeriods', () => {
  const prisma = { subscription: { updateMany: jest.fn() } };
  const service = new SubscriptionService(prisma as never, {} as never, {} as never);

  it('passe INACTIVE uniquement les abonnements actifs dont la période est échue', async () => {
    const now = new Date('2026-10-30T10:00:00Z');
    prisma.subscription.updateMany.mockResolvedValue({ count: 2 });

    await expect(service.expireEndedPeriods(now)).resolves.toBe(2);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
      data: { status: 'INACTIVE' },
    });
  });

  it("ne fait rien tant que SUBSCRIPTION_EXPIRY_ENABLED n'est pas activé", async () => {
    delete process.env.SUBSCRIPTION_EXPIRY_ENABLED;
    prisma.subscription.updateMany.mockClear();
    await service.runExpiryJob();
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });
});

describe('SubscriptionService : résilier, réactiver, impact', () => {
  const prisma = {
    subscription: { findUnique: jest.fn(), update: jest.fn() },
    annonce: { count: jest.fn() },
    staff: { count: jest.fn() },
    booking: { count: jest.fn() },
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new SubscriptionService(prisma as never, agencyService as never, {} as never);
  const end = new Date('2026-10-30T00:00:00Z');

  beforeEach(() => {
    jest.resetAllMocks();
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
  });

  it('programme la résiliation à la fin de la période', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: end,
    });
    await expect(service.cancel('A', 'owner-1')).resolves.toEqual({
      cancelAtPeriodEnd: true,
      activeUntil: end,
    });
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { agencyId: 'A' },
      data: { cancelAtPeriodEnd: true, canceledAt: expect.any(Date) },
    });
  });

  it('ne réécrit rien si la résiliation est déjà programmée', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: end,
    });
    await expect(service.cancel('A', 'owner-1')).resolves.toEqual({
      cancelAtPeriodEnd: true,
      activeUntil: end,
    });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('réactive un abonnement dont la résiliation est programmée', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: end,
    });
    await expect(service.resume('A', 'owner-1')).resolves.toEqual({
      cancelAtPeriodEnd: false,
      activeUntil: end,
    });
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { agencyId: 'A' },
      data: { cancelAtPeriodEnd: false, canceledAt: null },
    });
  });

  it('refuse de réactiver sans paiement un abonnement déjà expiré', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'INACTIVE',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: end,
    });
    await expect(errorCodeOf(service.resume('A', 'owner-1'))).resolves.toBe('SUBSCRIPTION_EXPIRED');
  });

  it('répond SUBSCRIPTION_NOT_FOUND à une agence sans souscription', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    await expect(errorCodeOf(service.cancel('A', 'owner-1'))).resolves.toBe(
      'SUBSCRIPTION_NOT_FOUND',
    );
  });

  it('refuse le staff', async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    await expect(errorCodeOf(service.cancel('A', 'staff-1'))).resolves.toBe('OWNER_ONLY');
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("décrit l'impact de la résiliation", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: end,
    });
    prisma.annonce.count.mockResolvedValue(4);
    prisma.staff.count.mockResolvedValue(3);
    prisma.booking.count.mockResolvedValue(2);
    await expect(service.getCancelImpact('A', 'owner-1')).resolves.toEqual({
      activeUntil: end,
      annonces: { online: 4 },
      members: { active: 3 },
      bookings: { upcoming: 2 },
    });
  });
});
