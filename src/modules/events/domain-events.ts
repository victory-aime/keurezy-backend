import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { EventEmitter } from 'events';
import { PropertyType } from '../../../prisma/generated/enums';

/** Événements métier échangés entre modules, sans dépendance directe entre eux. */
export interface DomainEvents {
  'chat.message.created': ChatMessageCreatedEvent;
  'booking.status.changed': BookingStatusChangedEvent;
  'annonce.published': AnnoncePublishedEvent;
  'subscription.payment.confirmed': SubscriptionPaymentConfirmedEvent;
  'subscription.renewal.due': SubscriptionRenewalDueEvent;
  'subscription.payment.applied': SubscriptionPaymentAppliedEvent;
  'subscription.moved.to.free': SubscriptionMovedToFreeEvent;
  'subscription.downgrade.applied': SubscriptionDowngradeAppliedEvent;
}

/** Paiement d'abonnement appliqué : e-mail de confirmation à l'owner. */
export interface SubscriptionPaymentAppliedEvent {
  agencyId: string;
  kind: 'RENEWAL' | 'UPGRADE' | 'REACTIVATION';
  /** Montant réglé (XOF) */
  amount: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * L'agence est passée au plan Gratuit : fin de période sans renouvellement, ou downgrade
 * programmé vers le Gratuit. Le surplus a été désactivé.
 */
export interface SubscriptionMovedToFreeEvent {
  agencyId: string;
  reason: 'PERIOD_ENDED' | 'SCHEDULED';
  /** Plan quitté */
  previousPlan: string;
}

/** Downgrade programmé appliqué vers un plan payant, période renouvelée. */
export interface SubscriptionDowngradeAppliedEvent {
  agencyId: string;
}

/** Échéance d'abonnement proche (J-7, J-3, J-1) : rappel à l'owner, une fois par palier. */
export interface SubscriptionRenewalDueEvent {
  agencyId: string;
  daysLeft: 7 | 3 | 1;
  periodEnd: Date;
}

/**
 * NabooPay confirme le paiement d'un checkout d'abonnement (webhook ou polling). L'écouteur
 * l'applique une seule fois : la clé d'idempotence est `orderId`.
 */
export interface SubscriptionPaymentConfirmedEvent {
  orderId: string;
  paidAt: string;
  /** Montant réglé selon NabooPay (relu chez eux, jamais pris du webhook) */
  paidAmount: number;
}

/** Réservation confirmée, refusée (y compris refus automatique) ou annulée par l'agence : e-mail au client. */
export interface BookingStatusChangedEvent {
  bookingId: string;
  status: 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  reason?: string;
}

/** Annonce mise en ligne : notification des clients abonnés à ce type de bien. */
export interface AnnoncePublishedEvent {
  annonceId: string;
  propertyType: PropertyType;
  title: string;
  city: string | null;
  agencyId: string;
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
