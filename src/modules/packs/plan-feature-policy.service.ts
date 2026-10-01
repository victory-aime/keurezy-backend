import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { FeatureCommercial } from '../../config/enum';
import {
  AnnonceStatus,
  InvitationStatus,
  SubscriptionStatus,
} from '../../../prisma/generated/enums';

export interface FeatureCapacityCheck {
  feature: string;
  enabled: boolean;
  capacity: number | null;
  currentUsage: number;
  remaining: number | null;
  allowed: boolean;
}

/** Seuil (part de la limite consommée) à partir duquel une limite est « bientôt atteinte ». */
export const NEAR_LIMIT_RATIO = 0.8;

export type UsageState = 'OK' | 'NEAR_LIMIT' | 'REACHED' | 'UNLIMITED';

/** Consommation d'une fonctionnalité limitée, telle qu'affichée sur la page abonnement. */
export interface FeatureUsage {
  feature: string;
  used: number;
  /** null = illimité */
  limit: number | null;
  remaining: number | null;
  /** 0–100, plafonné à 100 ; null si illimité */
  percentage: number | null;
  state: UsageState;
}

/**
 * Traduit un contrôle de capacité en consommation affichable. Part du même `checkCapacity` que
 * l'enforcement : une jauge ne peut donc pas contredire un refus de création.
 */
export function toUsage(check: FeatureCapacityCheck): FeatureUsage {
  const { feature, currentUsage: used, capacity: limit, remaining } = check;
  if (limit === null) {
    return { feature, used, limit, remaining: null, percentage: null, state: 'UNLIMITED' };
  }
  const ratio = limit === 0 ? 1 : used / limit;
  const state: UsageState =
    used >= limit ? 'REACHED' : ratio >= NEAR_LIMIT_RATIO ? 'NEAR_LIMIT' : 'OK';
  return {
    feature,
    used,
    limit,
    remaining,
    percentage: Math.min(100, Math.round(ratio * 100)),
    state,
  };
}

export interface PlanFeatureContext {
  planId: string;
  features: Map<
    string,
    {
      enabled: boolean;
      limit: number | null;
    }
  >;
}

@Injectable()
export class PlanFeaturePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Charge les features commerciales du plan actif
   */
  async getAgencyFeatureContext(agencyId: string): Promise<PlanFeatureContext> {
    const subscription = await this.prisma.subscription.findUnique({
      where: {
        agencyId,
      },
      select: {
        status: true,
        plan: {
          select: {
            id: true,

            planFeatures: {
              where: {
                feature: {
                  isCommercial: true,
                },
              },

              select: {
                enabled: true,
                limit: true,

                feature: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Aucun abonnement trouvé');
    }

    // Une période échue passe INACTIVE par le job horaire de SubscriptionService
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new HttpError(
        "L'abonnement de l'agence n'est pas actif",
        HttpStatus.FORBIDDEN,
        'SUBSCRIPTION_INACTIVE',
      );
    }

    const features = new Map();

    for (const item of subscription.plan.planFeatures) {
      features.set(item.feature.name, {
        enabled: item.enabled,
        limit: item.limit,
      });
    }

    return {
      planId: subscription.plan.id,
      features,
    };
  }

  /**
   * Compteur réel de chaque fonctionnalité limitée. Le quota porte sur ce qui est **actif** :
   * un élément désactivé (à la main ou par un downgrade) libère sa place.
   */
  readonly counters: Record<string, (agencyId: string) => Promise<number>> = {
    [FeatureCommercial.PROPERTIES]: (agencyId) => this.countPropertyAssets(agencyId),
    [FeatureCommercial.ANNOUNCES]: (agencyId) => this.countAnnonces(agencyId),
    [FeatureCommercial.USERS]: (agencyId) => this.countUserSeats(agencyId),
  };

  /** Biens actifs de l'agence (propriétés, terrains, bâtiments), soumis à une seule limite. */
  async countPropertyAssets(agencyId: string): Promise<number> {
    const where = { agencyId, isActive: true };
    const counts = await Promise.all([
      this.prisma.property.count({ where }),
      this.prisma.land.count({ where }),
      this.prisma.batiment.count({ where }),
    ]);
    return counts.reduce((total, count) => total + count, 0);
  }

  /** Annonces en ligne de l'agence : c'est ce que compte la limite `publish_properties`. */
  countAnnonces(agencyId: string): Promise<number> {
    return this.prisma.annonce.count({
      where: { status: AnnonceStatus.ACTIVE, property: { agencyId } },
    });
  }

  /** Places utilisateurs occupées : membres actifs et invitations en attente encore valides. */
  async countUserSeats(agencyId: string): Promise<number> {
    const [staff, pendingInvitations] = await Promise.all([
      this.prisma.staff.count({ where: { agencyId, isActive: true } }),
      this.prisma.invitation.count({
        where: { agencyId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
      }),
    ]);
    return staff + pendingInvitations;
  }

  /**
   * Reste-t-il une place pour qu'un élément de plus devienne actif (création ou réactivation) ?
   * À appeler uniquement sur un passage à l'état actif : l'élément lui-même n'est pas encore compté.
   */
  async hasRoomFor(agencyId: string, featureName: string): Promise<boolean> {
    const context = await this.getAgencyFeatureContext(agencyId);
    const used = await this.counters[featureName](agencyId);
    return this.checkCapacity(context, featureName, used).allowed;
  }

  /**
   * Vérifie une capacité du plan
   */
  checkCapacity(
    context: PlanFeatureContext,
    featureName: string,
    currentUsage: number,
  ): FeatureCapacityCheck {
    const feature = context.features.get(featureName);

    /**
     * Feature non disponible dans le plan
     */
    if (!feature) {
      return {
        feature: featureName,
        enabled: false,
        capacity: null,
        currentUsage,
        remaining: 0,
        allowed: false,
      };
    }

    /**
     * Feature désactivée
     */
    if (!feature.enabled) {
      return {
        feature: featureName,
        enabled: false,
        capacity: feature.limit,
        currentUsage,
        remaining: 0,
        allowed: false,
      };
    }

    /**
     * Capacité illimitée
     */
    if (feature.limit === null) {
      return {
        feature: featureName,
        enabled: true,
        capacity: null,
        currentUsage,
        remaining: null,
        allowed: true,
      };
    }

    const remaining = Math.max(feature.limit - currentUsage, 0);

    return {
      feature: featureName,
      enabled: true,
      capacity: feature.limit,
      currentUsage,
      remaining,
      allowed: currentUsage < feature.limit,
    };
  }
}
