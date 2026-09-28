import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { InvitationStatus, SubscriptionStatus } from '../../../prisma/generated/enums';

export interface FeatureCapacityCheck {
  feature: string;
  enabled: boolean;
  capacity: number | null;
  currentUsage: number;
  remaining: number | null;
  allowed: boolean;
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

    // ponytail: l'expiration (currentPeriodEnd) n'est pas vérifiée tant que le renouvellement n'existe pas
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

  /** Biens de l'agence (propriétés, terrains, bâtiments), soumis à la même limite du plan. */
  async countPropertyAssets(agencyId: string): Promise<number> {
    const counts = await Promise.all([
      this.prisma.property.count({ where: { agencyId } }),
      this.prisma.land.count({ where: { agencyId } }),
      this.prisma.batiment.count({ where: { agencyId } }),
    ]);
    return counts.reduce((total, count) => total + count, 0);
  }

  /** Places utilisateurs occupées : membres de l'équipe et invitations en attente encore valides. */
  async countUserSeats(agencyId: string): Promise<number> {
    const [staff, pendingInvitations] = await Promise.all([
      this.prisma.staff.count({ where: { agencyId } }),
      this.prisma.invitation.count({
        where: { agencyId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
      }),
    ]);
    return staff + pendingInvitations;
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
