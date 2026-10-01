import { SubscriptionLifecycleListener } from './subscription-lifecycle.listener';

jest.mock('../mail/resend.service', () => ({ ResendService: class {} }));
jest.mock('./notifications.service', () => ({ NotificationsService: class {} }));

describe('SubscriptionLifecycleListener', () => {
  const prisma = {
    agency: { findUnique: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn() },
    paymentTransaction: { findFirst: jest.fn() },
  };
  const resend = { sendSubscriptionNotice: jest.fn() };
  const notifications = { createNotification: jest.fn() };
  const listener = new SubscriptionLifecycleListener(
    {} as never,
    prisma as never,
    resend as never,
    notifications as never,
  );
  const periodEnd = new Date('2026-10-31T00:00:00Z');

  /** Agence Keur Immo, plan Standard ; downgrade programmé éventuel. */
  const agency = (scheduledPlan: string | null = null) => {
    prisma.agency.findUnique.mockResolvedValue({
      name: 'Keur Immo',
      owner: { user: { id: 'owner-1', name: 'Awa', email: 'awa@keur.sn' } },
      subscriptions: [
        {
          currentPeriodEnd: periodEnd,
          plan: { name: 'STANDARD_SUB' },
          scheduledPlanId: scheduledPlan ? 'plan-x' : null,
        },
      ],
    });
    prisma.subscriptionPlan.findUnique.mockResolvedValue(
      scheduledPlan ? { name: scheduledPlan } : null,
    );
  };
  const mail = () => resend.sendSubscriptionNotice.mock.calls[0][0];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEB_APP_URL = 'https://app.keurezy.sn';
  });

  it("rappel d'échéance : in-app et e-mail, renouvellement sinon passage au Gratuit", async () => {
    agency();
    await listener.renewalDue({ agencyId: 'A', daysLeft: 3, periodEnd });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAYMENT', scope: 'USER', recipients: ['owner-1'] }),
    );
    expect(mail()).toMatchObject({
      sendTo: 'awa@keur.sn',
      subject: 'Votre abonnement se termine dans 3 jours',
      highlight: 'L’abonnement Standard de Keur Immo se termine le 31/10/2026.',
      ctaLink: 'https://app.keurezy.sn/dashboard/subscription',
    });
    expect(mail().body).toContain('passera au plan Gratuit');
  });

  it('rappel avec un passage au Gratuit programmé : rien à payer', async () => {
    agency('FREE_SUB');
    await listener.renewalDue({ agencyId: 'A', daysLeft: 3, periodEnd });
    expect(mail().subject).toBe('Votre agence passe au plan Gratuit le 31/10/2026');
    expect(mail().body).toContain('0 F CFA à payer');
  });

  it('rappel avec un downgrade payant programmé : renouveler au tarif du nouveau plan', async () => {
    agency('BASIC_SUB');
    await listener.renewalDue({ agencyId: 'A', daysLeft: 7, periodEnd });
    expect(mail().highlight).toBe('Le 31/10/2026, votre agence passe au plan Débutant.');
  });

  it('paiement confirmé : montant, plan et période couverte', async () => {
    agency();
    await listener.paymentApplied({
      agencyId: 'A',
      orderId: 'o1',
      kind: 'RENEWAL',
      amount: 10_000,
      periodStart: new Date('2026-10-31T00:00:00Z'),
      periodEnd: new Date('2026-11-30T00:00:00Z'),
    });
    expect(mail()).toMatchObject({
      subject: 'Paiement confirmé : plan Standard',
      highlight: '10 000 F CFA pour le plan Standard, du 31/10/2026 au 30/11/2026.',
    });
  });

  it('paiement confirmé : le reçu PDF est joint', async () => {
    agency();
    prisma.paymentTransaction.findFirst.mockResolvedValue({
      naboo_order_id: 'o1',
      amount_to_pay: { toString: () => '10000' },
      confirmed_at: new Date('2026-10-31T00:00:00Z'),
      updatedAt: new Date('2026-10-31T00:00:00Z'),
      metadata: {},
      receiptNumber: 'KRZ-2026-000009',
      receiptAgency: { name: 'Keur Immo', address: 'Dakar', email: 'a@b.sn' },
      plan: { name: 'STANDARD_SUB' },
    });
    await listener.paymentApplied({
      agencyId: 'A',
      orderId: 'o1',
      kind: 'RENEWAL',
      amount: 10_000,
      periodStart: new Date('2026-10-31T00:00:00Z'),
      periodEnd: new Date('2026-11-30T00:00:00Z'),
    });
    const [attachment] = mail().attachments;
    expect(attachment.filename).toBe('recu-KRZ-2026-000009.pdf');
    expect(attachment.content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(prisma.paymentTransaction.findFirst.mock.calls[0][0].where).toMatchObject({
      agencyId: 'A',
      naboo_order_id: 'o1',
    });
  });

  it('reçu impossible à générer : e-mail envoyé sans pièce jointe', async () => {
    agency();
    prisma.paymentTransaction.findFirst.mockRejectedValue(new Error('db down'));
    await listener.paymentApplied({
      agencyId: 'A',
      orderId: 'o1',
      kind: 'UPGRADE',
      amount: 5_000,
      periodStart: new Date('2026-10-31T00:00:00Z'),
      periodEnd: new Date('2026-11-30T00:00:00Z'),
    });
    expect(mail().attachments).toBeUndefined();
  });

  it('passage au Gratuit en fin de période : lien vers le choix de plan', async () => {
    agency();
    await listener.movedToFree({
      agencyId: 'A',
      reason: 'PERIOD_ENDED',
      previousPlan: 'PREMIUM_SUB',
    });
    expect(mail()).toMatchObject({
      subject: 'Votre agence est passée au plan Gratuit',
      highlight: 'Votre abonnement Entreprise s’est terminé sans renouvellement.',
      ctaLink: 'https://app.keurezy.sn/dashboard/subscription?action=change',
    });
  });

  it("agence introuvable ou erreur : rien n'est envoyé, rien ne remonte", async () => {
    prisma.agency.findUnique.mockResolvedValue(null);
    await listener.downgradeApplied({ agencyId: 'A' });
    prisma.agency.findUnique.mockRejectedValue(new Error('db down'));
    await expect(listener.downgradeApplied({ agencyId: 'A' })).resolves.toBeUndefined();
    expect(resend.sendSubscriptionNotice).not.toHaveBeenCalled();
  });
});
