import { Prisma } from '../../../prisma/generated/client';
import { AnnonceStatus, SubscriptionStatus } from '../../../prisma/generated/enums';

/**
 * Agence visible du public : abonnement ACTIVE et e-mail du propriétaire vérifié. Le plan Gratuit
 * s'obtient sans paiement : sans cette vérification, des agences créées en masse pourraient
 * publier. L'agence non vérifiée garde son tableau de bord ; seules ses annonces restent hors ligne.
 */
export const publicAgencyWhere: Prisma.AgencyWhereInput = {
  subscriptions: { some: { status: SubscriptionStatus.ACTIVE } },
  owner: { user: { emailVerified: true } },
};

/**
 * Filtre de toute lecture publique d'annonce (liste, détail, devis, réservation, discussion) :
 * annonce ACTIVE, bien actif (pas désactivé par un downgrade) et agence visible (`publicAgencyWhere`). Quand l'abonnement expire, les annonces
 * disparaissent du public sans que leur statut change, et réapparaissent à la réactivation.
 */
export function publicAnnonceWhere(where: Prisma.AnnonceWhereInput = {}): Prisma.AnnonceWhereInput {
  return {
    AND: [
      {
        status: AnnonceStatus.ACTIVE,
        property: {
          isActive: true,
          agency: publicAgencyWhere,
        },
      },
      where,
    ],
  };
}
