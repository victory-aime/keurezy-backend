import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationScope, NotificationType } from '../../../prisma/generated/enums';
import { AnnoncePublishedEvent, DomainEventBus } from '../events/domain-events';
import { PreferencesService } from '../preferences/preferences.service';
import { NotificationsService } from './notifications.service';

/** Destinataires par notification enregistrée (limite la taille des écritures). */
const RECIPIENTS_PER_BATCH = 500;

/**
 * Nouvelle annonce en ligne : notification des clients abonnés à ce type de bien
 * (préférence « Nouvelles annonces », désactivée par défaut).
 */
@Injectable()
export class ListingNotificationListener implements OnModuleInit {
  private readonly logger = new Logger(ListingNotificationListener.name);

  constructor(
    private readonly events: DomainEventBus,
    private readonly preferences: PreferencesService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.events.on('annonce.published', (event) => this.notify(event));
  }

  async notify(event: AnnoncePublishedEvent) {
    const subscribers = await this.preferences.findListingSubscribers(event.propertyType);
    if (!subscribers.length) return;

    const content = event.city ? `${event.title} · ${event.city}` : event.title;
    for (let index = 0; index < subscribers.length; index += RECIPIENTS_PER_BATCH) {
      await this.notifications.createNotification({
        type: NotificationType.LISTING,
        scope: NotificationScope.USER,
        title: 'Nouvelle annonce',
        content,
        recipients: subscribers.slice(index, index + RECIPIENTS_PER_BATCH),
        data: { annonceId: event.annonceId },
      });
    }
    this.logger.log(`Annonce ${event.annonceId} : ${subscribers.length} client(s) notifié(s)`);
  }
}
