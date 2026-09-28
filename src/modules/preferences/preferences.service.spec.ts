import { PropertyType } from '../../../prisma/generated/enums';
import { PreferencesService } from './preferences.service';
import { resolveNotificationPreferences } from './notification-preferences';

const setup = () => {
  const prisma = {
    userPreference: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  };
  return { prisma, service: new PreferencesService(prisma as never) };
};

describe('PreferencesService', () => {
  it('retourne les valeurs par défaut et les options proposées', async () => {
    const { service, prisma } = setup();
    prisma.userPreference.findUnique.mockResolvedValue(null);

    const result = await service.getMyPreferences('user-1');

    expect(result.notifications.categories.LISTING.push).toBe(false);
    expect(result.options.notifications.categories.map((c) => c.key)).toContain('LISTING');
    expect(result.options.notifications.propertyTypes).toContain(PropertyType.APARTMENT);
  });

  it('met à jour partiellement, sans perdre les autres réglages', async () => {
    const { service, prisma } = setup();
    prisma.userPreference.findUnique.mockResolvedValue({
      notifications: { sound: 'CHIME', categories: { VISIT: { push: false } } },
    });

    const result = await service.updateNotificationPreferences('user-1', {
      categories: { LISTING: { push: true } },
      listingPropertyTypes: [PropertyType.STUDIO],
    });

    expect(result.notifications.sound).toBe('CHIME');
    expect(result.notifications.categories.VISIT.push).toBe(false);
    expect(result.notifications.categories.LISTING.push).toBe(true);
    expect(result.notifications.listingPropertyTypes).toEqual([PropertyType.STUDIO]);
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('trouve les abonnés aux nouvelles annonces selon le type de bien (vide = tous)', async () => {
    const { service, prisma } = setup();
    const listing = (types: PropertyType[]) =>
      resolveNotificationPreferences({
        categories: { LISTING: { push: true } },
        listingPropertyTypes: types,
      });
    prisma.userPreference.findMany.mockResolvedValue([
      { id: 'p1', userId: 'all-types', notifications: listing([]) },
      { id: 'p2', userId: 'studios', notifications: listing([PropertyType.STUDIO]) },
      { id: 'p3', userId: 'houses', notifications: listing([PropertyType.HOUSE]) },
    ]);

    expect(await service.findListingSubscribers(PropertyType.STUDIO)).toEqual([
      'all-types',
      'studios',
    ]);
  });
});
