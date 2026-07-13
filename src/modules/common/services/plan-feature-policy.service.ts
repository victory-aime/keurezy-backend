import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '_root/database/prisma.service';

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
