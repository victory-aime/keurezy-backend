import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { FeatureCommercial } from '../../config/enum';
import { AgencyService } from '../agency/agency.service';
import {
  BillingCycle,
  Plan,
  PlanCategory,
  SubscriptionStatus,
} from '../../../prisma/generated/enums';
import {
  FeatureUsage,
  PlanFeatureContext,
  PlanFeaturePolicyService,
  toUsage,
} from './plan-feature-policy.service';

/** Souscription de l'agence telle qu'affichée sur la page « Mon abonnement ». */
export interface SubscriptionSummary {
  status: SubscriptionStatus;
  plan: { id: string; name: Plan };
  billingCycle: BillingCycle | null;
  price: number | null;
  currency: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}

/** Fonctionnalité commerciale, incluse ou non dans le plan de l'agence. */
export interface PlanFeatureSummary {
  name: string;
  category: string;
  description: string | null;
  /** Limite du plan courant ; null = illimité ou non incluse */
  limit: number | null;
  /** false = proposée par un autre plan actif */
  included: boolean;
}

export interface AgencySubscriptionOverview {
  /** null = l'agence n'a aucune souscription */
  subscription: SubscriptionSummary | null;
  usage: FeatureUsage[];
  features: PlanFeatureSummary[];
}

/**
 * Abonnement d'une agence, côté propriétaire. Source de vérité de la page « Mon abonnement » :
 * le front n'affiche que ce qui est calculé ici (aucun prix ni quota recalculé côté client).
 */
@Injectable()
export class SubscriptionService {
  /** Fonctionnalités limitées qui ont un compteur réel, dans l'ordre d'affichage. */
  private readonly counters: Record<string, (agencyId: string) => Promise<number>> = {
    [FeatureCommercial.PROPERTIES]: (agencyId) => this.policy.countPropertyAssets(agencyId),
    [FeatureCommercial.ANNOUNCES]: (agencyId) => this.policy.countAnnonces(agencyId),
    [FeatureCommercial.USERS]: (agencyId) => this.policy.countUserSeats(agencyId),
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly policy: PlanFeaturePolicyService,
  ) {}

  /**
   * Plan, période, consommation et fonctionnalités de l'agence (propriétaire uniquement).
   * Un abonnement inactif est renvoyé tel quel : la page doit pouvoir l'afficher.
   */
  async getOverview(agencyId: string, userId: string): Promise<AgencySubscriptionOverview> {
    await this.assertOwner(agencyId, userId);

    const subscription = await this.prisma.subscription.findUnique({
      where: { agencyId },
      select: {
        status: true,
        billingCycle: true,
        price: true,
        currency: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            planFeatures: {
              where: { enabled: true },
              select: { limit: true, feature: { select: { name: true } } },
            },
          },
        },
      },
    });

    // Catalogue : fonctionnalités commerciales des plans en vente, plus celles du plan courant
    const catalog = await this.prisma.feature.findMany({
      where: {
        isCommercial: true,
        planFeatures: {
          some: {
            enabled: true,
            plan: {
              OR: [
                { isActive: true, planCategory: PlanCategory.SUBSCRIPTION_BASED },
                ...(subscription ? [{ id: subscription.plan.id }] : []),
              ],
            },
          },
        },
      },
      select: { name: true, category: true, description: true },
      orderBy: { category: 'asc' },
    });

    if (!subscription) {
      return {
        subscription: null,
        usage: [],
        features: catalog.map((f) => ({ ...f, limit: null, included: false })),
      };
    }

    const context: PlanFeatureContext = {
      planId: subscription.plan.id,
      features: new Map(
        subscription.plan.planFeatures.map((pf) => [
          pf.feature.name,
          { enabled: true, limit: pf.limit },
        ]),
      ),
    };

    const tracked = Object.keys(this.counters).filter((name) => context.features.has(name));
    const usage = await Promise.all(
      tracked.map(async (name) =>
        toUsage(this.policy.checkCapacity(context, name, await this.counters[name](agencyId))),
      ),
    );

    const { plan, price, ...period } = subscription;
    return {
      subscription: {
        ...period,
        plan: { id: plan.id, name: plan.name },
        price: price === null ? null : Number(price.toString()),
      },
      usage,
      features: catalog.map((f) => ({
        ...f,
        limit: context.features.get(f.name)?.limit ?? null,
        included: context.features.has(f.name),
      })),
    };
  }

  /** L'abonnement (montants compris) n'est visible et modifiable que par le propriétaire. */
  private async assertOwner(agencyId: string, userId: string) {
    const actor = await this.agencyService.agencyAccessControl(agencyId, userId);
    if (actor.type !== 'OWNER') {
      throw new HttpError(
        "Seul le propriétaire de l'agence peut gérer l'abonnement",
        HttpStatus.FORBIDDEN,
        'OWNER_ONLY',
      );
    }
  }
}
