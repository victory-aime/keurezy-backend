import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationType } from '../../../prisma/generated/enums';
import { PrismaService } from '../../database/prisma.service';
import { BookingStatusChangedEvent, DomainEventBus } from '../events/domain-events';
import { EmailService } from '../mail/mail.service';
import { allowsNotification } from '../preferences/notification-preferences';
import { PreferencesService } from '../preferences/preferences.service';

const frDate = (date: Date) => date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });

/** E-mail au client quand sa réservation est confirmée ou refusée (s'il l'accepte). */
@Injectable()
export class BookingEmailListener implements OnModuleInit {
  private readonly logger = new Logger(BookingEmailListener.name);

  constructor(
    private readonly events: DomainEventBus,
    private readonly prisma: PrismaService,
    private readonly preferences: PreferencesService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    this.events.on('booking.status.changed', (event) => this.send(event));
  }

  async send(event: BookingStatusChangedEvent) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: event.bookingId },
      select: {
        startDate: true,
        endDate: true,
        property: { select: { title: true } },
        client: { select: { user: { select: { id: true, email: true, name: true } } } },
      },
    });
    const user = booking?.client?.user;
    if (!booking || !user?.email) return;

    const preferences = (await this.preferences.getNotificationPreferences([user.id])).get(
      user.id,
    )!;
    if (!allowsNotification(preferences, NotificationType.BOOKING, 'email')) return;

    await this.emailService.sendBookingStatus({
      sendTo: user.email,
      username: user.name,
      confirmed: event.status === 'CONFIRMED',
      propertyTitle: booking.property.title,
      period: `du ${frDate(booking.startDate)} au ${frDate(booking.endDate)}`,
      message: event.reason,
    });
    this.logger.log(`E-mail de réservation (${event.status}) envoyé pour ${event.bookingId}`);
  }
}
