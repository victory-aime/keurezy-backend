import { SubscriptionBillingService } from './subscription-billing.service';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const decimal = (value: number) => ({ toString: () => String(value) });

describe('SubscriptionBillingService.applyPayment', () => {
  const tx = {
    paymentTransaction: { updateMany: jest.fn(), update: jest.fn() },
    subscription: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    planPricing: { findUniqueOrThrow: jest.fn() },
  };
  const prisma = {
    paymentTransaction: { findUnique: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new SubscriptionBillingService(prisma as never, {} as never);
  const deactivate = jest.spyOn(service, 'deactivateExcess').mockResolvedValue();

  /** Transaction en attente pour l'agence A, 5 000 XOF, plan premium mensuel. */
  const pending = (kind: string, extra: Record<string, unknown> = {}) =>
    prisma.paymentTransaction.findUnique.mockResolvedValue({
      kind,
      agencyId: 'A',
      amount_to_pay: decimal(5_000),
      status: 'PENDING',
      metadata: { planId: 'premium', billingCycle: 'MONTHLY', keep: [] },
      ...extra,
    });

  /** Abonnement standard mensuel, échéance au 31 oct. */
  const subscription = (extra: Record<string, unknown> = {}) =>
    tx.subscription.findUniqueOrThrow.mockResolvedValue({
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      currentPeriodEnd: day('2026-10-31'),
      scheduledBillingCycle: null,
      ...extra,
    });

  const confirm = (paidAmount = 5_000, paidAt = '2026-10-20T10:00:00Z') =>
    service.applyPayment({ orderId: 'o1', paidAt, paidAmount });

  const updateData = () => tx.subscription.update.mock.calls[0][0].data;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.paymentTransaction.updateMany.mockResolvedValue({ count: 1 });
    tx.planPricing.findUniqueOrThrow.mockResolvedValue({ price: decimal(20_000), currency: 'XOF' });
    subscription();
  });

  it('réclame la transaction dans la même transaction que son application', async () => {
    pending('UPGRADE');
    await expect(confirm()).resolves.toBe(true);
    expect(tx.paymentTransaction.updateMany).toHaveBeenCalledWith({
      where: { naboo_order_id: 'o1', status: 'PENDING' },
      data: { status: 'PAID', confirmed_at: new Date('2026-10-20T10:00:00Z') },
    });
  });

  it('enregistre la période couverte sur la transaction (historique de facturation)', async () => {
    pending('RENEWAL', { metadata: { planId: 'standard', billingCycle: 'MONTHLY', keep: [] } });
    await confirm();
    expect(tx.paymentTransaction.update).toHaveBeenCalledWith({
      where: { naboo_order_id: 'o1' },
      data: {
        metadata: {
          planId: 'standard',
          billingCycle: 'MONTHLY',
          keep: [],
          periodStart: '2026-10-31T00:00:00.000Z',
          periodEnd: '2026-11-30T00:00:00.000Z',
        },
      },
    });
  });

  it('webhook et polling simultanés : le second ne réapplique rien', async () => {
    pending('RENEWAL');
    await confirm();
    tx.paymentTransaction.updateMany.mockResolvedValue({ count: 0 }); // déjà réclamée
    await expect(confirm()).resolves.toBe(false);
    expect(tx.subscription.update).toHaveBeenCalledTimes(1);
  });

  it('montant réglé inférieur au devis : non appliqué, marqué en échec', async () => {
    pending('UPGRADE');
    await expect(confirm(4_999)).resolves.toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.paymentTransaction.updateMany).toHaveBeenCalledWith({
      where: { naboo_order_id: 'o1', status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  });

  it('ignore un onboarding et une transaction déjà traitée', async () => {
    pending('ONBOARDING');
    await expect(confirm()).resolves.toBe(false);
    pending('UPGRADE', { status: 'PAID' });
    await expect(confirm()).resolves.toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("renouvellement anticipé : la période suivante démarre à l'échéance, plan inchangé", async () => {
    pending('RENEWAL', { metadata: { planId: 'standard', billingCycle: 'MONTHLY', keep: [] } });
    await confirm();
    expect(updateData()).toMatchObject({
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      lastRenewalReminder: null,
      currentPeriodStart: day('2026-10-31'),
      currentPeriodEnd: day('2026-11-30'),
      currency: 'XOF',
    });
    expect(updateData().price.toString()).toBe('20000'); // tarif actuel du plan
    expect(updateData().planId).toBeUndefined();
  });

  it('renouvellement avec downgrade programmé : durée du cycle programmé', async () => {
    subscription({
      billingCycle: 'YEARLY',
      scheduledPlanId: 'basic',
      scheduledBillingCycle: 'MONTHLY',
    });
    pending('RENEWAL');
    await confirm();
    expect(updateData().currentPeriodEnd).toEqual(day('2026-11-30'));
    expect(updateData().planId).toBeUndefined(); // le downgrade garde sa date d'effet
    expect(updateData().price).toBeUndefined(); // posé par le job avec le nouveau plan
  });

  it('upgrade sur le même cycle : nouveau plan et prix, échéance inchangée, downgrade annulé', async () => {
    pending('UPGRADE');
    await confirm();
    expect(updateData()).toMatchObject({
      planId: 'premium',
      scheduledPlanId: null,
      scheduledAt: null,
    });
    expect(updateData().price.toString()).toBe('20000');
    expect(updateData().currentPeriodEnd).toBeUndefined();
  });

  it('upgrade vers un cycle plus long : nouvelle période à partir du paiement', async () => {
    pending('UPGRADE', { metadata: { planId: 'standard', billingCycle: 'YEARLY', keep: [] } });
    await confirm();
    expect(updateData()).toMatchObject({
      billingCycle: 'YEARLY',
      currentPeriodStart: new Date('2026-10-20T10:00:00Z'),
      currentPeriodEnd: new Date('2027-10-20T10:00:00Z'),
    });
  });

  it('réactivation : période à partir du paiement, éléments hors choix désactivés', async () => {
    subscription({ status: 'INACTIVE', currentPeriodEnd: day('2026-09-30') });
    const keep = [{ feature: 'manage_users', ids: ['s1'] }];
    pending('REACTIVATION', { metadata: { planId: 'basic', billingCycle: 'MONTHLY', keep } });
    await confirm();
    expect(updateData()).toMatchObject({
      status: 'ACTIVE',
      planId: 'basic',
      currentPeriodStart: new Date('2026-10-20T10:00:00Z'),
      currentPeriodEnd: new Date('2026-11-20T10:00:00Z'),
    });
    expect(deactivate).toHaveBeenCalledWith(tx, 'A', keep);
  });
});

describe('SubscriptionBillingService.deactivateExcess', () => {
  const tx = {
    property: { findMany: jest.fn(), updateMany: jest.fn() },
    land: { updateMany: jest.fn() },
    batiment: { updateMany: jest.fn() },
    annonce: { updateMany: jest.fn() },
    staff: { findMany: jest.fn(), updateMany: jest.fn() },
    user: { updateMany: jest.fn() },
    session: { deleteMany: jest.fn() },
    invitation: { updateMany: jest.fn() },
  };
  const service = new SubscriptionBillingService({} as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('membres non gardés : désactivés, déconnectés ; invitations non gardées annulées', async () => {
    tx.staff.findMany.mockResolvedValue([{ userId: 'u2' }, { userId: 'u3' }]);
    await service.deactivateExcess(tx as never, 'A', [{ feature: 'manage_users', ids: ['s1'] }]);
    expect(tx.staff.updateMany).toHaveBeenCalledWith({
      where: { agencyId: 'A', isActive: true, id: { notIn: ['s1'] } },
      data: { isActive: false },
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['u2', 'u3'] } } });
    expect(tx.invitation.updateMany).toHaveBeenCalledWith({
      where: { agencyId: 'A', status: 'PENDING', id: { notIn: ['s1'] } },
      data: { status: 'CANCELLED' },
    });
  });

  it('biens non gardés : désactivés, leurs annonces retirées ; rien de supprimé', async () => {
    tx.property.findMany.mockResolvedValue([{ id: 'p2' }]);
    await service.deactivateExcess(tx as never, 'A', [
      { feature: 'manage_properties', ids: ['p1', 'l1'] },
    ]);
    const where = { agencyId: 'A', isActive: true, id: { notIn: ['p1', 'l1'] } };
    expect(tx.land.updateMany).toHaveBeenCalledWith({ where, data: { isActive: false } });
    expect(tx.annonce.updateMany).toHaveBeenCalledWith({
      where: { propertyId: { in: ['p2'] }, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });
  });
});

describe('SubscriptionBillingService.applyScheduledChanges', () => {
  const tx = {
    planPricing: { findUniqueOrThrow: jest.fn() },
    subscription: { updateMany: jest.fn() },
  };
  const prisma = {
    subscription: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new SubscriptionBillingService(prisma as never, {} as never);
  const deactivate = jest.spyOn(service, 'deactivateExcess').mockResolvedValue();
  const now = new Date('2026-10-31T01:00:00Z');
  const keep = [{ feature: 'manage_users', ids: ['s1'] }];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.subscription.findMany.mockResolvedValue([
      {
        agencyId: 'A',
        scheduledPlanId: 'basic',
        scheduledBillingCycle: 'MONTHLY',
        scheduledKeep: keep,
      },
    ]);
    tx.planPricing.findUniqueOrThrow.mockResolvedValue({ price: decimal(5_000), currency: 'XOF' });
    tx.subscription.updateMany.mockResolvedValue({ count: 1 });
  });

  it("passe au plan programmé et désactive exactement ce qui n'a pas été gardé", async () => {
    await expect(service.applyScheduledChanges(now)).resolves.toBe(1);
    expect(prisma.subscription.findMany.mock.calls[0][0].where).toEqual({
      status: 'ACTIVE',
      scheduledAt: { lt: now },
    });
    expect(tx.subscription.updateMany.mock.calls[0][0]).toMatchObject({
      where: { agencyId: 'A', scheduledAt: { lt: now } },
      data: { planId: 'basic', billingCycle: 'MONTHLY', scheduledPlanId: null, scheduledAt: null },
    });
    expect(deactivate).toHaveBeenCalledWith(tx, 'A', keep);
  });

  it("vers le Gratuit : ni cycle ni échéance (plus de rappel ni d'expiration)", async () => {
    tx.planPricing.findUniqueOrThrow.mockResolvedValue({ price: decimal(0), currency: 'XOF' });
    await service.applyScheduledChanges(now);
    expect(tx.subscription.updateMany.mock.calls[0][0].data).toMatchObject({
      billingCycle: null,
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });

  it('déjà appliqué (relance du job) : rien ne se refait', async () => {
    tx.subscription.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.applyScheduledChanges(now)).resolves.toBe(0);
    expect(deactivate).not.toHaveBeenCalled();
  });

  it("une agence en échec n'empêche pas les autres", async () => {
    prisma.subscription.findMany.mockResolvedValue([
      {
        agencyId: 'A',
        scheduledPlanId: 'gone',
        scheduledBillingCycle: 'MONTHLY',
        scheduledKeep: [],
      },
      {
        agencyId: 'B',
        scheduledPlanId: 'basic',
        scheduledBillingCycle: 'MONTHLY',
        scheduledKeep: [],
      },
    ]);
    tx.planPricing.findUniqueOrThrow
      .mockRejectedValueOnce(new Error('pricing absent'))
      .mockResolvedValueOnce({ price: decimal(5_000), currency: 'XOF' });
    await expect(service.applyScheduledChanges(now)).resolves.toBe(1);
  });
});

describe('SubscriptionBillingService.expireToFree', () => {
  const tx = {
    subscription: { updateMany: jest.fn(), update: jest.fn() },
    subscriptionPlan: { findUniqueOrThrow: jest.fn() },
    property: { findMany: jest.fn() },
    land: { findMany: jest.fn() },
    batiment: { findMany: jest.fn() },
    annonce: { findMany: jest.fn() },
    staff: { findMany: jest.fn() },
    invitation: { findMany: jest.fn() },
  };
  const prisma = {
    subscription: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new SubscriptionBillingService(prisma as never, {} as never);
  const deactivate = jest.spyOn(service, 'deactivateExcess').mockResolvedValue();
  const now = new Date('2026-10-31T01:00:00Z');
  const day = (d: number) => new Date(`2026-0${d}-01T00:00:00Z`);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.subscription.findMany.mockResolvedValue([{ agencyId: 'A' }]);
    tx.subscription.updateMany.mockResolvedValue({ count: 1 });
    tx.subscriptionPlan.findUniqueOrThrow.mockResolvedValue({
      id: 'free',
      planFeatures: [
        { limit: 2, feature: { name: 'manage_properties' } },
        { limit: 1, feature: { name: 'publish_properties' } },
        { limit: 0, feature: { name: 'manage_users' } },
      ],
    });
    tx.property.findMany.mockResolvedValue([
      { id: 'p3', createdAt: day(3) },
      { id: 'p1', createdAt: day(1) },
    ]);
    tx.land.findMany.mockResolvedValue([{ id: 'l2', createdAt: day(2) }]);
    tx.batiment.findMany.mockResolvedValue([]);
    tx.annonce.findMany.mockResolvedValue([
      { id: 'a2', createdAt: day(2) },
      { id: 'a1', createdAt: day(1) },
    ]);
    tx.staff.findMany.mockResolvedValue([{ id: 's1', createdAt: day(1) }]);
    tx.invitation.findMany.mockResolvedValue([]);
  });

  it('passe au Gratuit sans échéance et garde les plus anciens dans ses limites', async () => {
    await expect(service.expireToFree(now)).resolves.toBe(1);
    expect(tx.subscription.update.mock.calls[0][0].data).toMatchObject({
      planId: 'free',
      status: 'ACTIVE',
      price: 0,
      billingCycle: null,
      currentPeriodEnd: null,
    });
    // annonces gardées parmi celles des biens gardés
    expect(tx.annonce.findMany.mock.calls[0][0].where.propertyId).toEqual({ in: ['p1'] });
    expect(deactivate).toHaveBeenCalledWith(tx, 'A', [
      { feature: 'manage_properties', ids: ['p1', 'l2'] },
      { feature: 'publish_properties', ids: ['a1'] },
      { feature: 'manage_users', ids: [] },
    ]);
  });

  it('concerne les périodes échues (résiliées seulement sans le flag) et les abonnements inactifs', async () => {
    await service.expireToFree(now, false);
    expect(prisma.subscription.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        { status: 'ACTIVE', currentPeriodEnd: { lt: now }, cancelAtPeriodEnd: true },
        { status: 'INACTIVE' },
      ],
    });
  });

  it('déjà basculée (relance du job ou autre instance) : rien ne se refait', async () => {
    tx.subscription.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.expireToFree(now)).resolves.toBe(0);
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(deactivate).not.toHaveBeenCalled();
  });
});
