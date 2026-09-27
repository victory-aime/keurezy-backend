import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PushPlatform } from '../../../prisma/generated/enums';
import { HttpError } from '../../config/http.error';
import { PushNotificationsDto, RegisterPushNotificationTokenDto } from './notifications.dto';
import { PrismaService } from '../../database/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { ExpoPushService, MobilePushMessage } from './expo-push.service';

/**
 * Distribution des notifications push selon l'appareil : FCM pour le navigateur,
 * service Expo Push pour l'application mobile. Les modules métier ne voient qu'une API.
 */
@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseService: FirebaseService,
    private readonly expoPush: ExpoPushService,
  ) {}

  /**
   * Enregistre le jeton d'un appareil pour l'utilisateur connecté. Un jeton déjà connu
   * (autre compte sur le même téléphone) est réattribué : il n'appartient qu'à un utilisateur.
   */
  async registerDeviceToken(userId: string, data: RegisterPushNotificationTokenDto): Promise<void> {
    const { deviceKey, token } = data;
    const platform = data.platform ?? PushPlatform.WEB;

    if (platform === PushPlatform.MOBILE_EXPO && !ExpoPushService.isExpoToken(token)) {
      throw new HttpError(
        'Jeton de notification invalide',
        HttpStatus.BAD_REQUEST,
        'INVALID_PUSH_TOKEN',
      );
    }

    await this.prisma.$transaction([
      this.prisma.deviceToken.deleteMany({
        where: { token, NOT: { userId, deviceKey } },
      }),
      this.prisma.deviceToken.upsert({
        where: { userId_deviceKey: { userId, deviceKey } },
        update: { token, platform, updatedAt: new Date() },
        create: { token, deviceKey, userId, platform },
      }),
    ]);
    this.logger.log(`Jeton ${platform} enregistré pour user=${userId}`);
  }

  /** Suppression demandée par l'utilisateur (déconnexion) : limitée à ses propres appareils. */
  async removeUserDeviceToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
  }

  private async handleWebTokenError(token: string, error: unknown) {
    if ((error as { code?: string })?.code === 'messaging/registration-token-not-registered') {
      await this.prisma.deviceToken.deleteMany({ where: { token } });
      this.logger.warn('[Push] Jeton web obsolète supprimé');
      return;
    }
    this.logger.error(`FCM error: ${String(error)}`);
  }

  private async sendToWebToken(token: string, payload: PushNotificationsDto) {
    try {
      await this.firebaseService.getMessaging().send({
        token,
        data: {
          ...payload.data,
          title: payload.title ?? '',
          body: payload.body,
          notificationId: payload.notificationId ?? '',
          type: payload.type ?? '',
        },
      });
    } catch (error) {
      await this.handleWebTokenError(token, error);
    }
  }

  /** Pastille de l'icône : notifications non lues + messages non lus. */
  private async getBadgeCounts(userIds: string[]): Promise<Map<string, number>> {
    const [notifications, messages] = await Promise.all([
      this.prisma.notificationDelivery.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, isRead: false },
        _count: { _all: true },
      }),
      this.prisma.conversationParticipant.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _sum: { unreadCount: true },
      }),
    ]);
    const counts = new Map<string, number>(userIds.map((id) => [id, 0]));
    notifications.forEach((row) =>
      counts.set(row.userId, (counts.get(row.userId) ?? 0) + row._count._all),
    );
    messages.forEach((row) =>
      counts.set(row.userId, (counts.get(row.userId) ?? 0) + (row._sum.unreadCount ?? 0)),
    );
    return counts;
  }

  async sendToUser(userId: string, payload: PushNotificationsDto) {
    await this.sendToUsers([userId], payload);
  }

  async sendToUsers(userIds: string[], payload: PushNotificationsDto) {
    const recipients = [...new Set(userIds.filter(Boolean))];
    if (!recipients.length) return;

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId: { in: recipients } },
      select: { token: true, userId: true, platform: true },
    });
    if (!devices.length) return;

    const mobile = devices.filter((device) => device.platform === PushPlatform.MOBILE_EXPO);
    const web = devices.filter((device) => device.platform !== PushPlatform.MOBILE_EXPO);
    this.logger.log(
      `Envoi push — destinataires=${recipients.length}, web=${web.length}, mobile=${mobile.length}`,
    );

    const badges = mobile.length
      ? await this.getBadgeCounts([...new Set(mobile.map((device) => device.userId))])
      : new Map<string, number>();

    const mobileMessages: MobilePushMessage[] = mobile.map((device) => ({
      token: device.token,
      title: payload.title ?? 'Keurezy',
      body: payload.body,
      type: payload.type,
      data: {
        ...payload.data,
        ...(payload.notificationId && { notificationId: payload.notificationId }),
      },
      badge: badges.get(device.userId),
    }));

    await Promise.allSettled([
      ...web.map((device) => this.sendToWebToken(device.token, payload)),
      this.expoPush.send(mobileMessages),
    ]);
  }
}
