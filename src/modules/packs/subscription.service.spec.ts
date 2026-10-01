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
    {} as never,
    {} as never,
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
      scheduledChange: null,
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
  const billing = { applyScheduledChanges: jest.fn() };
  const service = new SubscriptionService(
    prisma as never,
    {} as never,
    {} as never,
    billing as never,
    {} as never,
  );

  it('passe INACTIVE uniquement les abonnements actifs dont la période est échue', async () => {
    const now = new Date('2026-10-30T10:00:00Z');
    prisma.subscription.updateMany.mockResolvedValue({ count: 2 });

    await expect(service.expireEndedPeriods(now)).resolves.toBe(2);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
      data: { status: 'INACTIVE' },
    });
  });

  it("sans SUBSCRIPTION_EXPIRY_ENABLED, n'expire que les abonnements résiliés", async () => {
    delete process.env.SUBSCRIPTION_EXPIRY_ENABLED;
    prisma.subscription.updateMany.mockClear();
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    await service.runExpiryJob();
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lt: expect.any(Date) },
        cancelAtPeriodEnd: true,
      },
      data: { status: 'INACTIVE' },
    });
  });

  it("applique les downgrades programmés avant l'expiration", async () => {
    const order: string[] = [];
    billing.applyScheduledChanges.mockImplementation(async () => order.push('downgrade'));
    prisma.subscription.updateMany.mockImplementation(async () => {
      order.push('expire');
      return { count: 0 };
    });
    await service.runExpiryJob();
    expect(order).toEqual(['downgrade', 'expire']);
  });

  it('avec SUBSCRIPTION_EXPIRY_ENABLED, expire aussi les périodes non renouvelées', async () => {
    process.env.SUBSCRIPTION_EXPIRY_ENABLED = 'true';
    prisma.subscription.updateMany.mockClear();
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    await service.runExpiryJob();
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', currentPeriodEnd: { lt: expect.any(Date) } },
      data: { status: 'INACTIVE' },
    });
    delete process.env.SUBSCRIPTION_EXPIRY_ENABLED;
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
  const service = new SubscriptionService(
    prisma as never,
    agencyService as never,
    {} as never,
    {} as never,
    {} as never,
  );
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

  it("refuse la résiliation du plan Gratuit (pas d'échéance)", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
    await expect(errorCodeOf(service.cancel('A', 'owner-1'))).resolves.toBe('FREE_PLAN_NO_PERIOD');
    expect(prisma.subscription.update).not.toHaveBeenCalled();
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

describe('SubscriptionService.activateAsset', () => {
  const prisma = {
    property: { findFirst: jest.fn(), update: jest.fn() },
    land: { findFirst: jest.fn(), update: jest.fn() },
    batiment: { findFirst: jest.fn(), update: jest.fn() },
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const policy = { hasRoomFor: jest.fn() };
  const service = new SubscriptionService(
    prisma as never,
    agencyService as never,
    policy as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
  });

  it("réactive un bien désactivé de l'agence quand il reste une place", async () => {
    prisma.land.findFirst.mockResolvedValue({ isActive: false });
    policy.hasRoomFor.mockResolvedValue(true);
    await service.activateAsset('A', 'u', { type: 'LAND', id: 'l1' });
    expect(prisma.land.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'l1', agencyId: 'A' } }),
    );
    expect(prisma.land.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { isActive: true },
    });
  });

  it('refuse au-delà de la limite de biens', async () => {
    prisma.property.findFirst.mockResolvedValue({ isActive: false });
    policy.hasRoomFor.mockResolvedValue(false);
    await expect(
      errorCodeOf(service.activateAsset('A', 'u', { type: 'PROPERTY', id: 'p1' })),
    ).resolves.toBe('PROPERTY_CAPACITY_REACHED');
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it("ignore un bien d'une autre agence et ne recompte pas un bien déjà actif", async () => {
    prisma.batiment.findFirst.mockResolvedValue(null);
    await expect(
      errorCodeOf(service.activateAsset('A', 'u', { type: 'BUILDING', id: 'b1' })),
    ).resolves.toBe('ASSET_NOT_FOUND');

    prisma.batiment.findFirst.mockResolvedValue({ isActive: true });
    await service.activateAsset('A', 'u', { type: 'BUILDING', id: 'b1' });
    expect(policy.hasRoomFor).not.toHaveBeenCalled();
    expect(prisma.batiment.update).not.toHaveBeenCalled();
  });

  it('refuse le staff', async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    await expect(
      errorCodeOf(service.activateAsset('A', 'u', { type: 'LAND', id: 'l1' })),
    ).resolves.toBe('OWNER_ONLY');
  });
});

describe('SubscriptionService.sendRenewalReminders', () => {
  const prisma = { subscription: { findMany: jest.fn(), updateMany: jest.fn() } };
  const events = { emit: jest.fn() };
  const service = new SubscriptionService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    events as never,
  );
  const now = new Date('2026-10-24T09:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
  });

  it("cherche les abonnements actifs, non résiliés, dont l'échéance tombe sous 7 jours", async () => {
    prisma.subscription.findMany.mockResolvedValue([]);
    await service.sendRenewalReminders(now);
    expect(prisma.subscription.findMany.mock.calls[0][0].where).toEqual({
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gt: now, lte: new Date('2026-10-31T09:00:00Z') },
    });
  });

  it('classe au palier J-7, J-3 ou J-1 et réclame le palier avant d’émettre', async () => {
    prisma.subscription.findMany.mockResolvedValue([
      { agencyId: 'A', currentPeriodEnd: new Date('2026-10-31T00:00:00Z') }, // 6,6 j → J-7
      { agencyId: 'B', currentPeriodEnd: new Date('2026-10-26T12:00:00Z') }, // 2,1 j → J-3
      { agencyId: 'C', currentPeriodEnd: new Date('2026-10-24T20:00:00Z') }, // 0,5 j → J-1
    ]);
    await expect(service.sendRenewalReminders(now)).resolves.toBe(3);
    expect(events.emit.mock.calls.map(([, e]) => [e.agencyId, e.daysLeft])).toEqual([
      ['A', 7],
      ['B', 3],
      ['C', 1],
    ]);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        agencyId: 'B',
        OR: [{ lastRenewalReminder: null }, { lastRenewalReminder: { gt: 3 } }],
      },
      data: { lastRenewalReminder: 3 },
    });
  });

  it('palier déjà envoyé (job relancé) : rien de plus', async () => {
    prisma.subscription.findMany.mockResolvedValue([
      { agencyId: 'A', currentPeriodEnd: new Date('2026-10-31T00:00:00Z') },
    ]);
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.sendRenewalReminders(now)).resolves.toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('SubscriptionService.listPayments', () => {
  const prisma = { paymentTransaction: { findMany: jest.fn(), count: jest.fn() } };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new SubscriptionService(
    prisma as never,
    agencyService as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const row = (extra: Record<string, unknown>) => ({
    id: 't1',
    kind: 'RENEWAL',
    amount_to_pay: { toString: () => '10000' },
    status: 'PAID',
    confirmed_at: new Date('2026-10-01T10:00:00Z'),
    createdAt: new Date('2026-10-01T09:59:00Z'),
    metadata: {},
    plan: { name: 'STANDARD_SUB' },
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER', userOwnerId: 'u' });
    prisma.paymentTransaction.count.mockResolvedValue(1);
  });

  it("ne liste que l'agence, et un onboarding seulement s'il est payé", async () => {
    prisma.paymentTransaction.findMany.mockResolvedValue([]);
    await service.listPayments('A', 'owner', 2, 10);
    expect(prisma.paymentTransaction.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        agencyId: 'A',
        OR: [{ kind: { not: 'ONBOARDING' } }, { kind: 'ONBOARDING', status: 'PAID' }],
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
  });

  it("n'expose aucun champ de metadata, seulement la période", async () => {
    prisma.paymentTransaction.findMany.mockResolvedValue([
      row({
        metadata: {
          periodStart: '2026-10-31T00:00:00.000Z',
          periodEnd: '2026-11-30T00:00:00.000Z',
          keep: [{ feature: 'manage_users', ids: ['s1'] }],
        },
      }),
    ]);
    const { content } = await service.listPayments('A', 'owner');
    expect(content[0]).toEqual({
      id: 't1',
      kind: 'RENEWAL',
      plan: 'STANDARD_SUB',
      amount: 10000,
      currency: 'XOF',
      status: 'PAID',
      periodStart: new Date('2026-10-31T00:00:00.000Z'),
      periodEnd: new Date('2026-11-30T00:00:00.000Z'),
      paidAt: new Date('2026-10-01T10:00:00Z'),
      createdAt: new Date('2026-10-01T09:59:00Z'),
    });
  });

  it("onboarding ancien : période déduite du paiement et du cycle, sans fuite de l'onboarding", async () => {
    prisma.paymentTransaction.findMany.mockResolvedValue([
      row({
        kind: 'ONBOARDING',
        metadata: { billingCycle: 'MONTHLY', password: 'chiffré', userEmail: 'x@y.sn' },
      }),
    ]);
    const { content } = await service.listPayments('A', 'owner');
    expect(content[0].periodStart).toEqual(new Date('2026-10-01T10:00:00Z'));
    expect(content[0].periodEnd).toEqual(new Date('2026-11-01T10:00:00Z'));
    expect(JSON.stringify(content)).not.toContain('chiffré');
  });

  it('borne la taille de page et refuse le staff', async () => {
    prisma.paymentTransaction.findMany.mockResolvedValue([]);
    const page = await service.listPayments('A', 'owner', 1, 1000);
    expect(page.totalDataPerPage).toBe(50);

    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    await expect(errorCodeOf(service.listPayments('A', 'staff'))).resolves.toBe('OWNER_ONLY');
  });
});

describe('SubscriptionService.getLimits', () => {
  const prisma = {
    subscription: { findUnique: jest.fn() },
    paymentTransaction: { count: jest.fn() },
    property: { count: jest.fn() },
    land: { count: jest.fn() },
    batiment: { count: jest.fn() },
    annonce: { count: jest.fn() },
    staff: { count: jest.fn() },
    invitation: { count: jest.fn() },
  };
  const agencyService = { agencyAccessControl: jest.fn() };
  const service = new SubscriptionService(
    prisma as never,
    agencyService as never,
    new PlanFeaturePolicyService(prisma as never),
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.subscription.findUnique.mockResolvedValue({
      plan: {
        id: 'std',
        name: 'STANDARD_SUB',
        planFeatures: [{ limit: 3, feature: { name: 'manage_properties' } }],
      },
    });
    prisma.property.count.mockResolvedValue(2);
    prisma.land.count.mockResolvedValue(1);
    prisma.batiment.count.mockResolvedValue(0);
    prisma.paymentTransaction.count.mockResolvedValue(0);
  });

  it("ouvert au staff de l'agence : usage, sans montant", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'STAFF' });
    const limits = await service.getLimits('A', 'staff');
    expect(limits.plan).toEqual({ id: 'std', name: 'STANDARD_SUB' });
    expect(limits.usage).toEqual([
      expect.objectContaining({
        feature: 'manage_properties',
        used: 3,
        limit: 3,
        state: 'REACHED',
      }),
    ]);
    expect(JSON.stringify(limits)).not.toMatch(/price|amount/);
  });

  it("historique de paiement = un paiement payé autre que l'inscription", async () => {
    agencyService.agencyAccessControl.mockResolvedValue({ type: 'OWNER' });
    prisma.paymentTransaction.count.mockResolvedValue(1);
    await expect(service.getLimits('A', 'owner')).resolves.toMatchObject({
      hasPaymentHistory: true,
    });
    expect(prisma.paymentTransaction.count).toHaveBeenCalledWith({
      where: { agencyId: 'A', status: 'PAID', kind: { not: 'ONBOARDING' } },
    });
  });

  it("refuse un utilisateur d'une autre agence", async () => {
    agencyService.agencyAccessControl.mockRejectedValue(
      new HttpError('x', 403, 'AGENCY_ACCESS_DENIED'),
    );
    await expect(errorCodeOf(service.getLimits('A', 'other'))).resolves.toBe(
      'AGENCY_ACCESS_DENIED',
    );
  });
});
