import { SubscriptionChangeService } from './subscription-change.service';
import { HttpError } from '../../config/http.error';

jest.mock('./subscription.service', () => ({ SubscriptionService: class {} }));
jest.mock('../payments/services/naboo.service', () => ({ NabooService: class {} }));

const errorCodeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: HttpError) => (error.getResponse() as { errorCode: string }).errorCode,
  );

const decimal = (value: number) => ({ toString: () => String(value) });

/** Plan en vente : prix mensuel et annuel, limites par fonctionnalité. */
const planRecord = (
  id: string,
  monthly: number,
  features: Record<string, number | null>,
  extra: Record<string, unknown> = {},
) => ({
  id,
  isActive: true,
  pricings: [
    { billingCycle: 'MONTHLY', price: decimal(monthly) },
    { billingCycle: 'YEARLY', price: decimal(monthly * 10) },
  ],
  planFeatures: Object.entries(features).map(([name, limit]) => ({ limit, feature: { name } })),
  ...extra,
});

describe('SubscriptionChangeService.getQuote', () => {
  const prisma = {
    subscription: { findUnique: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn() },
    staff: { findMany: jest.fn() },
    invitation: { findMany: jest.fn() },
  };
  const subscriptions = { assertOwner: jest.fn() };
  const policy = {
    counters: {
      manage_users: jest.fn(),
      publish_properties: jest.fn(),
    },
  };
  const service = new SubscriptionChangeService(
    prisma as never,
    subscriptions as never,
    policy as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const standard = planRecord('standard', 10_000, { manage_users: 8, publish_properties: null });
  const basic = planRecord('basic', 5_000, { manage_users: 1, publish_properties: null });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      price: decimal(10_000),
      currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      scheduledPlanId: null,
      scheduledBillingCycle: null,
      plan: standard,
    });
  });

  it('downgrade : liste les collaborateurs en surplus, ignore une limite illimitée', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(basic);
    policy.counters.manage_users.mockResolvedValue(3);
    prisma.staff.findMany.mockResolvedValue([
      { id: 's1', user: { name: 'Awa', email: 'awa@x.sn' } },
      { id: 's2', user: { name: '', email: 'moussa@x.sn' } },
    ]);
    prisma.invitation.findMany.mockResolvedValue([{ id: 'i1', name: 'Fatou', email: 'f@x.sn' }]);

    const quote = await service.getQuote('A', 'u', 'basic', 'MONTHLY');

    expect(quote).toMatchObject({ kind: 'DOWNGRADE', amount: 0, currency: 'XOF' });
    expect(quote.excess).toEqual([
      {
        feature: 'manage_users',
        limit: 1,
        used: 3,
        items: [
          { id: 's1', label: 'Awa', type: 'STAFF' },
          { id: 's2', label: 'moussa@x.sn', type: 'STAFF' },
          { id: 'i1', label: 'Fatou (invitation)', type: 'INVITATION' },
        ],
      },
    ]);
    expect(policy.counters.publish_properties).not.toHaveBeenCalled();
  });

  it('une fonctionnalité absente du plan visé a une limite de 0', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(planRecord('mini', 2_000, {}));
    policy.counters.manage_users.mockResolvedValue(1);
    policy.counters.publish_properties.mockResolvedValue(0);
    prisma.staff.findMany.mockResolvedValue([{ id: 's1', user: { name: 'Awa', email: 'a' } }]);
    prisma.invitation.findMany.mockResolvedValue([]);

    const quote = await service.getQuote('A', 'u', 'mini', 'MONTHLY');
    expect(quote.excess.map((e) => [e.feature, e.limit])).toEqual([['manage_users', 0]]);
  });

  it('upgrade : pas de surplus calculé', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(planRecord('premium', 20_000, {}));
    const quote = await service.getQuote('A', 'u', 'premium', 'MONTHLY');
    expect(quote.kind).toBe('UPGRADE');
    expect(quote.amount).toBeGreaterThan(0);
    expect(quote.excess).toEqual([]);
  });

  it('refuse un plan inactif', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(
      planRecord('old', 1_000, {}, { isActive: false }),
    );
    await expect(errorCodeOf(service.getQuote('A', 'u', 'old', 'MONTHLY'))).resolves.toBe(
      'PLAN_NOT_FOUND',
    );
  });

  it('renouvellement avec downgrade programmé : prix du plan programmé', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      ...(await prisma.subscription.findUnique()),
      scheduledPlanId: 'basic',
      scheduledBillingCycle: 'MONTHLY',
    });
    prisma.subscriptionPlan.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.id === 'basic' ? basic : standard),
    );
    const quote = await service.getQuote('A', 'u', 'standard', 'MONTHLY');
    expect(quote).toMatchObject({ kind: 'RENEWAL', amount: 5_000 });
  });

  it("refuse le staff (contrôle d'accès délégué)", async () => {
    subscriptions.assertOwner.mockRejectedValue(new HttpError('x', 403, 'OWNER_ONLY'));
    await expect(errorCodeOf(service.getQuote('A', 'u', 'basic', 'MONTHLY'))).resolves.toBe(
      'OWNER_ONLY',
    );
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });
});

describe('SubscriptionChangeService.createCheckout', () => {
  const KEY = 'checkout-intent-0001';
  const standard = planRecord('standard', 10_000, {});
  const premium = planRecord('premium', 20_000, {});
  const prisma = {
    subscription: { findUnique: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    agency: { findUniqueOrThrow: jest.fn() },
    paymentTransaction: { findUnique: jest.fn(), create: jest.fn() },
  };
  const subscriptions = { assertOwner: jest.fn() };
  const naboo = { createTransaction: jest.fn() };
  const service = new SubscriptionChangeService(
    prisma as never,
    subscriptions as never,
    { counters: {} } as never,
    naboo as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      price: decimal(10_000),
      currentPeriodStart: new Date(Date.now() - 15 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 15 * 86_400_000),
      scheduledPlanId: null,
      scheduledBillingCycle: null,
      plan: standard,
    });
    prisma.subscriptionPlan.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.id === 'premium' ? premium : planRecord('basic', 5_000, {})),
    );
    prisma.subscriptionPlan.findUniqueOrThrow.mockResolvedValue({ name: 'PREMIUM_SUB' });
    prisma.agency.findUniqueOrThrow.mockResolvedValue({ name: 'Keur Immo' });
    naboo.createTransaction.mockResolvedValue({ order_id: 'o1', checkout_url: 'https://pay/o1' });
  });

  const checkout = (planId: string) =>
    service.createCheckout('A', 'u', { planId, billingCycle: 'MONTHLY' }, KEY);

  it("rattache la transaction au User de l'owner, pas à son profil agence", async () => {
    subscriptions.assertOwner.mockResolvedValue('user-of-owner');
    await checkout('premium');
    expect(prisma.paymentTransaction.create.mock.calls[0][0].data.userId).toBe('user-of-owner');
  });

  it('fige le montant du devis dans la transaction, avec la clé et le type', async () => {
    await expect(checkout('premium')).resolves.toEqual({
      checkoutUrl: 'https://pay/o1',
      orderId: 'o1',
    });
    const { data } = prisma.paymentTransaction.create.mock.calls[0][0];
    expect(data).toMatchObject({
      agencyId: 'A',
      kind: 'UPGRADE',
      idempotencyKey: KEY,
      planId: 'premium',
      status: 'PENDING',
    });
    // 10 000 × ~15/30, arrondi supérieur
    expect(data.amount_to_pay).toBeGreaterThanOrEqual(5_000);
    expect(naboo.createTransaction.mock.calls[0][0].products[0].price).toBe(data.amount_to_pay);
  });

  it('même clé : renvoie le même checkout sans rappeler NabooPay', async () => {
    prisma.paymentTransaction.findUnique.mockResolvedValue({
      agencyId: 'A',
      naboo_order_id: 'o1',
      checkout_url: 'https://pay/o1',
      metadata: { planId: 'premium', billingCycle: 'MONTHLY', keep: [] },
    });
    await expect(checkout('premium')).resolves.toEqual({
      checkoutUrl: 'https://pay/o1',
      orderId: 'o1',
    });
    expect(naboo.createTransaction).not.toHaveBeenCalled();
  });

  it('même clé pour une autre demande ou une autre agence : 422', async () => {
    prisma.paymentTransaction.findUnique.mockResolvedValue({
      agencyId: 'A',
      naboo_order_id: 'o1',
      checkout_url: 'u',
      metadata: { planId: 'standard', billingCycle: 'MONTHLY', keep: [] },
    });
    await expect(errorCodeOf(checkout('premium'))).resolves.toBe('IDEMPOTENCY_KEY_REUSED');

    prisma.paymentTransaction.findUnique.mockResolvedValue({
      agencyId: 'B',
      naboo_order_id: 'o1',
      checkout_url: 'u',
      metadata: { planId: 'premium', billingCycle: 'MONTHLY', keep: [] },
    });
    await expect(errorCodeOf(checkout('premium'))).resolves.toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('requête jumelle : la contrainte unique tranche, le checkout gagnant est renvoyé', async () => {
    const { Prisma } = jest.requireActual('../../../prisma/generated/client');
    prisma.paymentTransaction.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      agencyId: 'A',
      naboo_order_id: 'o-winner',
      checkout_url: 'https://pay/o-winner',
      metadata: { planId: 'premium', billingCycle: 'MONTHLY', keep: [] },
    });
    prisma.paymentTransaction.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(checkout('premium')).resolves.toEqual({
      checkoutUrl: 'https://pay/o-winner',
      orderId: 'o-winner',
    });
  });

  it('refuse une clé absente et un downgrade', async () => {
    const withoutKey = service.createCheckout(
      'A',
      'u',
      { planId: 'premium', billingCycle: 'MONTHLY' },
      undefined,
    );
    await expect(errorCodeOf(withoutKey)).resolves.toBe('IDEMPOTENCY_KEY_REQUIRED');
    await expect(errorCodeOf(checkout('basic'))).resolves.toBe('DOWNGRADE_NOT_PAYABLE');
    expect(naboo.createTransaction).not.toHaveBeenCalled();
  });
});

describe('SubscriptionChangeService.validateKeep', () => {
  const service = new SubscriptionChangeService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const excess = [
    {
      feature: 'manage_users',
      limit: 1,
      used: 3,
      items: [
        { id: 's1', label: 'a', type: 'STAFF' as const },
        { id: 's2', label: 'b', type: 'STAFF' as const },
      ],
    },
  ];
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
      return null;
    } catch (error) {
      return ((error as HttpError).getResponse() as { errorCode: string }).errorCode;
    }
  };

  it('accepte un choix dans la limite', () => {
    expect(service.validateKeep(excess, [{ feature: 'manage_users', ids: ['s2'] }])).toEqual([
      { feature: 'manage_users', ids: ['s2'] },
    ]);
  });

  it('refuse au-delà de la limite, un élément inconnu, un choix manquant', () => {
    expect(
      codeOf(() => service.validateKeep(excess, [{ feature: 'manage_users', ids: ['s1', 's2'] }])),
    ).toBe('SELECTION_EXCEEDS_LIMIT');
    expect(
      codeOf(() => service.validateKeep(excess, [{ feature: 'manage_users', ids: ['x'] }])),
    ).toBe('SELECTION_INVALID');
    expect(codeOf(() => service.validateKeep(excess, []))).toBe('SELECTION_REQUIRED');
  });
});

describe('SubscriptionChangeService.getPaymentStatus', () => {
  const prisma = { paymentTransaction: { findFirst: jest.fn(), updateMany: jest.fn() } };
  const naboo = { getTransactionById: jest.fn() };
  const events = { emit: jest.fn() };
  const service = new SubscriptionChangeService(
    prisma as never,
    { assertOwner: jest.fn() } as never,
    {} as never,
    naboo as never,
    events as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("cherche la commande dans l'agence de l'appelant, hors onboarding", async () => {
    prisma.paymentTransaction.findFirst.mockResolvedValue(null);
    await expect(errorCodeOf(service.getPaymentStatus('A', 'u', 'o1'))).resolves.toBe(
      'PAYMENT_NOT_FOUND',
    );
    expect(prisma.paymentTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { naboo_order_id: 'o1', agencyId: 'A', kind: { not: 'ONBOARDING' } },
      }),
    );
  });

  it('payé chez NabooPay avant le webhook : émet la confirmation, reste en attente', async () => {
    prisma.paymentTransaction.findFirst.mockResolvedValue({ status: 'PENDING' });
    naboo.getTransactionById.mockResolvedValue({
      transaction_status: 'paid',
      paid_at: 'T',
      amount: 5_000,
    });
    await expect(service.getPaymentStatus('A', 'u', 'o1')).resolves.toEqual({ status: 'PENDING' });
    expect(events.emit).toHaveBeenCalledWith('subscription.payment.confirmed', {
      orderId: 'o1',
      paidAt: 'T',
      paidAmount: 5_000,
    });
  });

  it("annulé chez NabooPay : statut local mis à jour s'il était en attente", async () => {
    prisma.paymentTransaction.findFirst.mockResolvedValue({ status: 'PENDING' });
    naboo.getTransactionById.mockResolvedValue({ transaction_status: 'cancelled' });
    await expect(service.getPaymentStatus('A', 'u', 'o1')).resolves.toEqual({
      status: 'CANCELLED',
    });
    expect(prisma.paymentTransaction.updateMany).toHaveBeenCalledWith({
      where: { naboo_order_id: 'o1', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  });

  it('déjà traité : ne rappelle pas NabooPay', async () => {
    prisma.paymentTransaction.findFirst.mockResolvedValue({ status: 'PAID' });
    await expect(service.getPaymentStatus('A', 'u', 'o1')).resolves.toEqual({ status: 'PAID' });
    expect(naboo.getTransactionById).not.toHaveBeenCalled();
  });
});

describe('SubscriptionChangeService : downgrade programmé', () => {
  const standard = planRecord('standard', 10_000, { manage_users: 8 });
  const basic = planRecord('basic', 5_000, { manage_users: 1 });
  const free = planRecord('free', 0, { manage_users: 0 });
  const end = new Date(Date.now() + 20 * 86_400_000);
  const prisma = {
    subscription: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn() },
    staff: { findMany: jest.fn() },
    invitation: { findMany: jest.fn() },
  };
  const policy = { counters: { manage_users: jest.fn() } };
  const billing = { activateFreePlan: jest.fn() };
  const service = new SubscriptionChangeService(
    prisma as never,
    { assertOwner: jest.fn() } as never,
    policy as never,
    {} as never,
    {} as never,
    billing as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      price: decimal(10_000),
      currentPeriodStart: new Date(Date.now() - 10 * 86_400_000),
      currentPeriodEnd: end,
      scheduledPlanId: null,
      scheduledBillingCycle: null,
      plan: standard,
    });
    prisma.subscriptionPlan.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'basic'
          ? basic
          : where.id === 'free'
            ? free
            : planRecord('premium', 20_000, {}),
      ),
    );
    policy.counters.manage_users.mockResolvedValue(2);
    prisma.staff.findMany.mockResolvedValue([
      { id: 's1', user: { name: 'Awa', email: 'a' } },
      { id: 's2', user: { name: 'Moussa', email: 'm' } },
    ]);
    prisma.invitation.findMany.mockResolvedValue([]);
  });

  const schedule = (planId: string, ids: string[]) =>
    service.scheduleChange('A', 'u', {
      planId,
      billingCycle: 'MONTHLY',
      keep: [{ feature: 'manage_users', ids }],
    });

  it("enregistre le plan, le choix et la date d'effet (échéance actuelle)", async () => {
    await schedule('basic', ['s2']);
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { agencyId: 'A' },
      data: {
        scheduledPlanId: 'basic',
        scheduledBillingCycle: 'MONTHLY',
        scheduledKeep: [{ feature: 'manage_users', ids: ['s2'] }],
        scheduledAt: end,
      },
    });
  });

  it('refuse un choix au-delà de la limite, un élément étranger, un upgrade', async () => {
    await expect(errorCodeOf(schedule('basic', ['s1', 's2']))).resolves.toBe(
      'SELECTION_EXCEEDS_LIMIT',
    );
    await expect(errorCodeOf(schedule('basic', ['other-agency-staff']))).resolves.toBe(
      'SELECTION_INVALID',
    );
    await expect(errorCodeOf(schedule('premium', []))).resolves.toBe('NOT_A_DOWNGRADE');
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it("Gratuit avec une période en cours : programmé pour l'échéance, comme tout downgrade", async () => {
    await schedule('free', []);
    expect(prisma.subscription.update.mock.calls[0][0].data).toMatchObject({
      scheduledPlanId: 'free',
      scheduledAt: end,
    });
    expect(billing.activateFreePlan).not.toHaveBeenCalled();
  });

  it('Gratuit après expiration : appliqué tout de suite, sans paiement, avec le choix', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'INACTIVE',
      billingCycle: 'MONTHLY',
      price: decimal(10_000),
      currentPeriodStart: new Date(Date.now() - 40 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() - 10 * 86_400_000),
      scheduledPlanId: null,
      scheduledBillingCycle: null,
      plan: standard,
    });
    await schedule('free', []);
    expect(billing.activateFreePlan).toHaveBeenCalledWith('A', 'free', [
      { feature: 'manage_users', ids: [] },
    ]);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('déjà au Gratuit : le rechoisir est refusé', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      billingCycle: null,
      price: decimal(0),
      currentPeriodStart: new Date(),
      currentPeriodEnd: null,
      scheduledPlanId: null,
      scheduledBillingCycle: null,
      plan: free,
    });
    await expect(errorCodeOf(schedule('free', []))).resolves.toBe('NOT_A_DOWNGRADE');
    expect(billing.activateFreePlan).not.toHaveBeenCalled();
  });

  it('annulation : efface le downgrade programmé', async () => {
    await service.cancelScheduledChange('A', 'u');
    expect(prisma.subscription.updateMany.mock.calls[0][0]).toMatchObject({
      where: { agencyId: 'A' },
      data: { scheduledPlanId: null, scheduledAt: null },
    });
  });
});
