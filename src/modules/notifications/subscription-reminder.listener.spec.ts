import { SubscriptionReminderListener } from './subscription-reminder.listener';

jest.mock('../mail/resend.service', () => ({ ResendService: class {} }));
jest.mock('./notifications.service', () => ({ NotificationsService: class {} }));

describe('SubscriptionReminderListener', () => {
  const prisma = { agency: { findUnique: jest.fn() } };
  const resend = { sendSubscriptionRenewalReminder: jest.fn() };
  const notifications = { createNotification: jest.fn() };
  const listener = new SubscriptionReminderListener(
    {} as never,
    prisma as never,
    resend as never,
    notifications as never,
  );
  const event = {
    agencyId: 'A',
    daysLeft: 3 as const,
    periodEnd: new Date('2026-10-31T00:00:00Z'),
  };

  beforeEach(() => jest.clearAllMocks());

  it("prévient l'owner par notification in-app et par e-mail, lien vers la page abonnement", async () => {
    process.env.WEB_APP_URL = 'https://app.keurezy.sn';
    prisma.agency.findUnique.mockResolvedValue({
      name: 'Keur Immo',
      owner: { user: { id: 'owner-1', name: 'Awa', email: 'awa@keur.sn' } },
      subscriptions: [{ plan: { name: 'STANDARD_SUB' } }],
    });
    await listener.send(event);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAYMENT', scope: 'USER', recipients: ['owner-1'] }),
    );
    expect(resend.sendSubscriptionRenewalReminder).toHaveBeenCalledWith({
      sendTo: 'awa@keur.sn',
      username: 'Awa',
      agencyName: 'Keur Immo',
      planName: 'STANDARD_SUB',
      endDate: '31/10/2026',
      daysLeft: '3 jours',
      renewLink: 'https://app.keurezy.sn/dashboard/subscription',
    });
  });

  it("agence introuvable : n'envoie rien", async () => {
    prisma.agency.findUnique.mockResolvedValue(null);
    await listener.send(event);
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(resend.sendSubscriptionRenewalReminder).not.toHaveBeenCalled();
  });
});
