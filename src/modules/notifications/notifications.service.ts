import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';
import { NotificationsDto } from './notifications.dto';
import { HttpError } from '_root/config/http.error';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(params: NotificationsDto) {
    const { recipients, ...data } = params;

    const cleanRecipients = (recipients ?? []).filter((id): id is string => !!id);

    if (!cleanRecipients.length) {
      return;
    }
    return this.prisma.notification.create({
      data: {
        ...data,
        deliveries: {
          create: recipients?.map((userId) => ({
            userId,
          })),
        },
      },
    });
  }

  async notifyUserAndOwner({ userId, ownerId, payload }) {
    return this.createNotification({
      ...payload,
      scope: 'USER',
      recipients: [userId, ownerId],
    });
  }

  async notifyAgency({ agencyMembers, payload }) {
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
    } catch (error) {
      console.error('Erreur getUnreadNotifications:', error);
      throw new HttpError('Une erreur interne est survenue.');
    }
    return this.prisma.notificationDelivery.findMany({
      where: {
        userId,
        isRead: false,
      },
      include: {
        notification: true,
      },
    });
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
    } catch (error) {
      throw new HttpError('Une erreur interne est survenue.');
    }
  }
}
