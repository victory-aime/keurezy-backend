import { NotificationType, PropertyType } from '../../../prisma/generated/enums';
import {
  allowsNotification,
  DEFAULT_NOTIFICATION_PREFERENCES,
  resolveNotificationPreferences,
} from './notification-preferences';

describe('préférences de notification', () => {
  it('applique les valeurs par défaut sans préférence enregistrée', () => {
    expect(resolveNotificationPreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(resolveNotificationPreferences('corrompu')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('garde « Compte et sécurité » actif et l’e-mail aux seules réservations', () => {
    const preferences = resolveNotificationPreferences({
      categories: {
        ACCOUNT: { push: false },
        MESSAGE: { push: false, email: true },
        BOOKING: { email: false },
      },
    });
    expect(preferences.categories.ACCOUNT.push).toBe(true);
    expect(preferences.categories.MESSAGE).toEqual({ push: false, email: false });
    expect(preferences.categories.BOOKING).toEqual({ push: true, email: false });
  });

  it('ignore les types de bien et les sons inconnus', () => {
    const preferences = resolveNotificationPreferences({
      listingPropertyTypes: [PropertyType.APARTMENT, 'CHATEAU'],
      sound: 'TROMPETTE',
    });
    expect(preferences.listingPropertyTypes).toEqual([PropertyType.APARTMENT]);
    expect(preferences.sound).toBe('DEFAULT');
  });

  it('décide par catégorie et par canal ; les types non réglables passent en push', () => {
    const preferences = resolveNotificationPreferences({ categories: { VISIT: { push: false } } });
    expect(allowsNotification(preferences, NotificationType.VISIT, 'push')).toBe(false);
    expect(allowsNotification(preferences, NotificationType.BOOKING, 'email')).toBe(true);
    expect(allowsNotification(preferences, NotificationType.LISTING, 'push')).toBe(false);
    expect(allowsNotification(preferences, NotificationType.LEAD, 'push')).toBe(true);
    expect(allowsNotification(preferences, NotificationType.LEAD, 'email')).toBe(false);
  });
});
