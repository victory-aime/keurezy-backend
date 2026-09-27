import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationType } from '../../../prisma/generated/enums';
import { ChatMessageCreatedEvent, DomainEventBus } from '../events/domain-events';
import { PushNotificationService } from './push-notification.service';

const PREVIEW_LENGTH = 80;

/**
 * Push des nouveaux messages aux destinataires hors ligne. Le chat publie l'événement ;
 * le canal de diffusion (FCM aujourd'hui, Expo Push demain) reste propre à ce module.
 * Les messages ne créent pas de notification persistée : le chat a ses propres non-lus.
 */
@Injectable()
export class ChatNotificationListener implements OnModuleInit {
  constructor(
    private readonly events: DomainEventBus,
    private readonly pushService: PushNotificationService,
  ) {}

  onModuleInit() {
    this.events.on('chat.message.created', (event) => this.notify(event));
  }

  private async notify(event: ChatMessageCreatedEvent) {
    const body =
      event.preview.length > PREVIEW_LENGTH
        ? `${event.preview.slice(0, PREVIEW_LENGTH)}…`
        : event.preview;

    await this.pushService.sendToUsers(event.recipientIds, {
      type: NotificationType.MESSAGE,
      title: event.senderName ?? 'Nouveau message',
      body,
      notificationId: event.messageId,
      data: {
        conversationId: event.conversationId,
        messageId: event.messageId,
        propertyId: event.propertyId,
        ...(event.bookingId && { bookingId: event.bookingId }),
      },
    });
  }
}
