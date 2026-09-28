import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { PropertyType, Role, UserStatus } from '../../../prisma/generated/enums';
import { PrismaService } from '../../database/prisma.service';
import {
  CATEGORY_DEFINITIONS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_SOUNDS,
  NotificationCategory,
  NotificationPreferences,
  resolveNotificationPreferences,
} from './notification-preferences';
import { ChannelPreferenceDto, UpdateNotificationPreferencesDto } from './preferences.dto';

const LISTING_SUBSCRIBERS_BATCH = 1000;

/**
 * Préférences de l'utilisateur. Rien n'est enregistré tant qu'il ne modifie rien :
 * les valeurs par défaut s'appliquent. Le thème reste sur User.
 */
@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Options proposées par les applications (libellés, canaux, sons, types de bien). */
  private notificationOptions() {
    return {
      categories: NOTIFICATION_CATEGORIES.map((key) => ({ key, ...CATEGORY_DEFINITIONS[key] })),
      sounds: [...NOTIFICATION_SOUNDS],
      propertyTypes: Object.values(PropertyType),
    };
  }

  async getMyPreferences(userId: string) {
    const stored = await this.prisma.userPreference.findUnique({
      where: { userId },
      select: { notifications: true },
    });
    return {
      notifications: resolveNotificationPreferences(stored?.notifications),
      options: { notifications: this.notificationOptions() },
    };
  }

  /** Mise à jour partielle : seuls les champs envoyés changent, les règles sont réappliquées. */
  async updateNotificationPreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    const stored = await this.prisma.userPreference.findUnique({
      where: { userId },
      select: { notifications: true },
    });
    const current = resolveNotificationPreferences(stored?.notifications);

    const categories = { ...current.categories };
    const changes: Partial<Record<NotificationCategory, ChannelPreferenceDto>> =
      dto.categories ?? {};
    for (const category of NOTIFICATION_CATEGORIES) {
      const change = changes[category];
      if (change) categories[category] = { ...categories[category], ...change };
    }

    const next = resolveNotificationPreferences({
      ...current,
      ...(dto.listingPropertyTypes && { listingPropertyTypes: dto.listingPropertyTypes }),
      ...(dto.sound && { sound: dto.sound }),
      ...(dto.inAppSound !== undefined && { inAppSound: dto.inAppSound }),
      categories,
    });

    const notifications = next as unknown as Prisma.InputJsonValue;
    await this.prisma.userPreference.upsert({
      where: { userId },
      update: { notifications },
      create: { userId, notifications },
    });
    return {
      message: 'Préférences enregistrées',
      notifications: next,
    };
  }

  /** Préférences de plusieurs destinataires en une requête (valeurs par défaut sinon). */
  async getNotificationPreferences(
    userIds: string[],
  ): Promise<Map<string, NotificationPreferences>> {
    const rows = userIds.length
      ? await this.prisma.userPreference.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, notifications: true },
        })
      : [];
    const stored = new Map(rows.map((row) => [row.userId, row.notifications]));
    return new Map(userIds.map((id) => [id, resolveNotificationPreferences(stored.get(id))]));
  }

  /**
   * Clients actifs abonnés aux nouvelles annonces de ce type de bien
   * (liste vide dans leurs préférences = tous les types).
   */
  async findListingSubscribers(propertyType: PropertyType): Promise<string[]> {
    const subscribers: string[] = [];
    let cursor: string | undefined;

    for (;;) {
      const rows = await this.prisma.userPreference.findMany({
        where: {
          notifications: { path: ['categories', 'LISTING', 'push'], equals: true },
          user: { role: Role.USER, status: UserStatus.ACTIVE },
        },
        select: { id: true, userId: true, notifications: true },
        orderBy: { id: 'asc' },
        take: LISTING_SUBSCRIBERS_BATCH,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      for (const row of rows) {
        const { listingPropertyTypes } = resolveNotificationPreferences(row.notifications);
        if (!listingPropertyTypes.length || listingPropertyTypes.includes(propertyType)) {
          subscribers.push(row.userId);
        }
      }
      if (rows.length < LISTING_SUBSCRIBERS_BATCH) break;
      cursor = rows[rows.length - 1].id;
    }
    return subscribers;
  }
}
