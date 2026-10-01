import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationType } from '../../../prisma/generated/enums';
import { PrismaService } from '../../database/prisma.service';
import { DomainEventBus, SubscriptionRenewalDueEvent } from '../events/domain-events';
import { ResendService } from '../mail/resend.service';
import { NotificationsService } from './notifications.service';

const frDate = (date: Date) => date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });

/**
 * Rappel de renouvellement à l'owner : e-mail et notification in-app. Message de facturation,
 * envoyé quelles que soient les préférences de notification (sans lui, l'agence expire).
 */
@Injectable()
export class SubscriptionReminderListener implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionReminderListener.name);

  constructor(
    private readonly events: DomainEventBus,
    private readonly prisma: PrismaService,
    private readonly resend: ResendService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.events.on('subscription.renewal.due', (event) => this.send(event));
  }

  async send({ agencyId, daysLeft, periodEnd }: SubscriptionRenewalDueEvent) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: {
        name: true,
        owner: { select: { user: { select: { id: true, name: true, email: true } } } },
        subscriptions: { select: { plan: { select: { name: true } } } },
      },
    });
    const owner = agency?.owner.user;
    if (!agency || !owner) return;

    const endDate = frDate(periodEnd);
    const delay = daysLeft === 1 ? '1 jour' : `${daysLeft} jours`;
    const planName = agency.subscriptions[0]?.plan.name ?? '';

    await this.notifications.createNotification({
      type: NotificationType.PAYMENT,
      scope: 'USER',
      title: 'Votre abonnement arrive à échéance',
      content: `Votre abonnement se termine le ${endDate}. Renouvelez-le depuis la page Abonnement pour garder vos annonces en ligne.`,
      recipients: [owner.id],
    });
    if (owner.email) {
      await this.resend.sendSubscriptionRenewalReminder({
        sendTo: owner.email,
        username: owner.name,
        agencyName: agency.name,
        planName,
        endDate,
        daysLeft: delay,
        renewLink: `${process.env.WEB_APP_URL}/dashboard/subscription`,
      });
    }
    this.logger.log(`Rappel de renouvellement (J-${daysLeft}) envoyé à l'agence ${agencyId}`);
  }
}
