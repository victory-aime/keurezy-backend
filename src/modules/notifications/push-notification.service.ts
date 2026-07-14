import { Injectable, Logger } from '@nestjs/common';
import { PushNotificationsDto, RegisterPushNotificationTokenDto } from './notifications.dto';
import { PrismaService } from '../../database/prisma.service';
import { FirebaseService } from '../common/services/firebase.service';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Upsert du token FCM pour un utilisateur.
   * Utilise `token` comme clé unique pour éviter les doublons
   * si l'utilisateur se connecte depuis plusieurs appareils.
   */
  async registerDeviceToken(userId: string, data: RegisterPushNotificationTokenDto): Promise<void> {
    const { deviceKey, token } = data;
    await this.prisma.deviceToken.upsert({
      where: {
        userId_deviceKey: { userId, deviceKey },
      },
      update: {
        token,
        updatedAt: new Date(),
      },
      create: {
        token,
        deviceKey,
        userId,
      },
    });
    this.logger.log(`Token enregistré pour user=${userId}`);
  }

  /**
   * Récupère tous les tokens actifs d'un utilisateur.
   * Utile pour envoyer une notification à toutes ses sessions.
   */
  async getTokensByUserId(userId: string): Promise<string[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  /**
   * Supprime un token (ex logout, token expiré côté FCM).
   */
  async removeDeviceToken(fcmToken: string): Promise<void> {
    await this.prisma.deviceToken.delete({
      where: { token: fcmToken },
    });
    this.logger.warn(`[Push] Token obsolète supprimé: ${fcmToken}`);
  }

  async handleTokenError(token: string, error: any) {
    if (error?.code === 'messaging/registration-token-not-registered') {
      await this.removeDeviceToken(token);
      this.logger.warn(`[Push] Token mort nettoyé, pas de re-throw`);
      return;
    }
    throw error;
  }

  async sendToToken(token: string, payload: PushNotificationsDto) {
    try {
      await this.firebaseService.getMessaging().send({
        token,
        data: {
          title: payload.title ?? '',
          body: payload.body,
          notificationId: payload.notificationId ?? '',
          type: payload.type ?? '',
        },
      });
    } catch (error) {
      this.logger.error('FCM error', error);
      await this.handleTokenError(token, error);
    }
  }

  async sendToUser(userId: string, payload: PushNotificationsDto) {
    const tokens = await this.getTokensByUserId(userId);
    this.logger.log(`Destinataire — envoi push FCM à ${tokens}`);
    if (!tokens.length) {
      return;
    }
    await Promise.allSettled(tokens.map((token) => this.sendToToken(token, payload)));
  }

  async sendToUsers(userIds: string[], payload: PushNotificationsDto) {
    await Promise.allSettled(userIds.map((userId) => this.sendToUser(userId, payload)));
  }
}
