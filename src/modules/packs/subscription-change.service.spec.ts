import { SubscriptionChangeService } from './subscription-change.service';
import { HttpError } from '../../config/http.error';

jest.mock('./subscription.service', () => ({ SubscriptionService: class {} }));

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
  planCategory: 'SUBSCRIPTION_BASED',
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

  it('refuse un plan inactif ou à la commission', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(
      planRecord('old', 1_000, {}, { isActive: false }),
    );
    await expect(errorCodeOf(service.getQuote('A', 'u', 'old', 'MONTHLY'))).resolves.toBe(
      'PLAN_NOT_FOUND',
    );
    prisma.subscriptionPlan.findUnique.mockResolvedValue(
      planRecord('com', 1_000, {}, { planCategory: 'COMMISSION_BASED' }),
    );
    await expect(errorCodeOf(service.getQuote('A', 'u', 'com', 'MONTHLY'))).resolves.toBe(
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
