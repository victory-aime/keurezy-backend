jest.mock('../mail/mail.service', () => ({ EmailService: jest.fn() }));
jest.mock('../preferences/preferences.service', () => ({ PreferencesService: jest.fn() }));
jest.mock('./notifications.service', () => ({ NotificationsService: jest.fn() }));

import { NotificationType, PropertyType } from '../../../prisma/generated/enums';
import { resolveNotificationPreferences } from '../preferences/notification-preferences';
import { BookingEmailListener } from './booking-email.listener';
import { ListingNotificationListener } from './listing-notification.listener';

const booking = {
  startDate: new Date('2026-10-05'),
  endDate: new Date('2026-10-07'),
  property: { title: 'Studio Mermoz' },
  client: { user: { id: 'user-1', email: 'awa@example.com', name: 'Awa' } },
};

describe('BookingEmailListener', () => {
  const setup = (stored: unknown) => {
    const prisma = { booking: { findUnique: jest.fn().mockResolvedValue(booking) } };
    const preferences = {
      getNotificationPreferences: jest
        .fn()
        .mockResolvedValue(new Map([['user-1', resolveNotificationPreferences(stored)]])),
    };
    const email = { sendBookingStatus: jest.fn() };
    const listener = new BookingEmailListener(
      { on: jest.fn() } as never,
      prisma as never,
      preferences as never,
      email as never,
    );
    return { listener, email };
  };

  it('envoie l’e-mail de confirmation par défaut', async () => {
    const { listener, email } = setup(undefined);
    await listener.send({ bookingId: 'booking-1', status: 'CONFIRMED' });
    expect(email.sendBookingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sendTo: 'awa@example.com', status: 'CONFIRMED' }),
    );
  });

  it('n’envoie rien si le client a désactivé l’e-mail des réservations', async () => {
    const { listener, email } = setup({ categories: { BOOKING: { email: false } } });
    await listener.send({ bookingId: 'booking-1', status: 'REJECTED', reason: 'Complet' });
    expect(email.sendBookingStatus).not.toHaveBeenCalled();
  });
});

describe('ListingNotificationListener', () => {
  it('notifie les abonnés par lots, avec l’annonce à ouvrir', async () => {
    const subscribers = Array.from({ length: 501 }, (_, index) => `user-${index}`);
    const preferences = { findListingSubscribers: jest.fn().mockResolvedValue(subscribers) };
    const notifications = { createNotification: jest.fn() };
    const listener = new ListingNotificationListener(
      { on: jest.fn() } as never,
      preferences as never,
      notifications as never,
    );

    await listener.notify({
      annonceId: 'annonce-1',
      propertyType: PropertyType.STUDIO,
      title: 'Studio Mermoz',
      city: 'Dakar',
      agencyId: 'agency-A',
    });

    expect(preferences.findListingSubscribers).toHaveBeenCalledWith(PropertyType.STUDIO);
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationType.LISTING,
        content: 'Studio Mermoz · Dakar',
        data: { annonceId: 'annonce-1' },
      }),
    );
  });
});
