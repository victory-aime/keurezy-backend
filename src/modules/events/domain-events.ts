import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { EventEmitter } from 'events';

/** Événements métier échangés entre modules, sans dépendance directe entre eux. */
export interface DomainEvents {
  'chat.message.created': ChatMessageCreatedEvent;
}

export interface ChatMessageCreatedEvent {
  conversationId: string;
  messageId: string;
  senderId: string;
  senderName: string | null;
  /** Destinataires à notifier (hors ligne ou conversation fermée) */
  recipientIds: string[];
  agencyId: string;
  propertyId: string;
  bookingId: string | null;
  preview: string;
}

type Listener<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void | Promise<void>;

/**
 * Bus d'événements en mémoire. Un écouteur en échec est journalisé sans interrompre
 * l'émetteur (un envoi de message ne doit jamais échouer à cause d'une notification).
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly emitter = new EventEmitter();

  on<K extends keyof DomainEvents>(event: K, listener: Listener<K>): void {
    this.emitter.on(event, (payload: DomainEvents[K]) => {
      Promise.resolve()
        .then(() => listener(payload))
        .catch((error: unknown) =>
          this.logger.error(`Écouteur « ${event} » en échec: ${String(error)}`),
        );
    });
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }
}

@Global()
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class DomainEventsModule {}
