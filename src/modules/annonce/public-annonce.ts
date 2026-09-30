import { Prisma } from '../../../prisma/generated/client';
import { AnnonceStatus, SubscriptionStatus } from '../../../prisma/generated/enums';

/**
 * Filtre de toute lecture publique d'annonce (liste, détail, devis, réservation, discussion) :
 * annonce ACTIVE et agence à l'abonnement ACTIVE. Quand l'abonnement expire, les annonces
 * disparaissent du public sans que leur statut change, et réapparaissent à la réactivation.
 */
export function publicAnnonceWhere(where: Prisma.AnnonceWhereInput = {}): Prisma.AnnonceWhereInput {
  return {
    AND: [
      {
        status: AnnonceStatus.ACTIVE,
        property: { agency: { subscriptions: { some: { status: SubscriptionStatus.ACTIVE } } } },
      },
      where,
    ],
  };
}
