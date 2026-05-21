import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '_root/database/prisma.service';
import { NotificationType, VisitStatus } from '../../../prisma/generated/enums';
import { NotificationsService } from '_root/modules/notifications/notifications.service';

@Injectable()
export class VisiteJobService {
  private readonly logger = new Logger();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markPastVisitsAsDone() {
    const now = new Date();
    this.logger.log('🔄 CRON visite job started');

    const visits = await this.prisma.visit.findMany({
      where: {
        endTime: {
          lt: now,
        },
        status: {
          in: [VisitStatus.PLANNED, VisitStatus.CONFIRMED],
        },
      },
      include: {
        lead: { include: { client: { include: { user: true } } } },
        property: true,
        agent: true,
        agency: {
          include: { owner: true },
        },
      },
    });

    if (!visits.length) return {};

    for (const visit of visits) {
      await this.prisma.visit.update({
        where: { id: visit.id },
        data: { status: VisitStatus.DONE },
      });

      const recipients = [
        visit.lead?.client?.user?.id,
        visit.agentId ?? undefined,
        visit?.agency?.owner?.userId,
      ].filter((id): id is string => Boolean(id));

      if (recipients?.length > 0) {
        const notif = await this.notificationsService.createNotification({
          type: NotificationType.SYSTEM,
          scope: 'USER',
          title: 'Visite terminée automatiquement',
          content: `La visite pour le bien "${visit.property?.title}" a été marquée comme effectuée.`,
          recipients: recipients,
        });
        this.logger.log(notif);
      }
    }
  }
}
