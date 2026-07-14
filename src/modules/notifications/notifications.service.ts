import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsDto } from './notifications.dto';
import { HttpError } from '../../config/http.error';
import { PushNotificationService } from './push-notification.service';
import { NotificationType } from '../../../prisma/generated/enums';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationsService: PushNotificationService,
  ) {}

  async createNotification(params: NotificationsDto) {
    const { recipients, ...data } = params;

    const cleanRecipients = (recipients ?? []).filter((id): id is string => !!id);

    if (!cleanRecipients.length) {
      return;
    }
    const notification = await this.prisma.notification.create({
      data: {
        ...data,
        deliveries: {
          create: recipients?.map((userId) => ({
            userId,
          })),
        },
      },
    });
    await this.pushNotificationsService.sendToUsers(cleanRecipients, {
      title: notification.title!,
      body: notification.content,
      notificationId: notification.id,
      type: notification.type,
    });
    return notification;
  }

  async notifyUserAndOwner({ userId, ownerId, payload }) {
    return this.createNotification({
      ...payload,
      scope: 'USER',
      recipients: [userId, ownerId],
    });
  }

  async notifyAgency({
    agencyMembers,
    payload,
  }: {
    agencyMembers: string[];
    payload: { type: NotificationType; content: string; title: string };
  }) {
    return this.createNotification({
      ...payload,
      scope: 'AGENCY',
      recipients: agencyMembers,
    });
  }

  async notifyStaff({ staffUserId, payload }) {
    return this.createNotification({
      ...payload,
      scope: 'USER',
      recipients: [staffUserId],
    });
  }

  async getUserNotifications(userId: string) {
    return this.prisma.notificationDelivery.findMany({
      where: { userId },
      include: {
        notification: true,
      },
      orderBy: {
        notification: {
          createdAt: 'desc',
        },
      },
    });
  }
  async getUnreadNotifications(userId: string) {
    try {
      return this.prisma.notificationDelivery.findMany({
        where: {
          userId,
          isRead: false,
        },
        include: {
          notification: true,
        },
      });
    } catch (error) {
      console.error('Erreur getUnreadNotifications:', error);
      throw new HttpError('Une erreur interne est survenue.');
    }
  }

  async readOneNotification(notificationId: string, userId: string) {
    try {
      await this.prisma.notificationDelivery.updateMany({
        where: {
          userId,
          notificationId,
        },
        data: {
          isRead: true,
        },
      });

      return { message: 'Notification lue avec succès' };
    } catch (error) {
      console.error('Erreur readOneNotification:', error);
      throw new HttpError('Une erreur interne est survenue.');
    }
  }
  async readAllNotifications(userId: string) {
    try {
      return this.prisma.notificationDelivery.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });
    } catch {
      throw new HttpError('Une erreur interne est survenue.');
    }
  }
}
