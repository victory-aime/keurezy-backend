import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { FeatureCommercial } from '../../config/enum';
import {
  AnnonceStatus,
  BillingCycle,
  InvitationStatus,
  PlanCategory,
  SubscriptionStatus,
} from '../../../prisma/generated/enums';
import { PlanFeaturePolicyService } from './plan-feature-policy.service';
import { SubscriptionService } from './subscription.service';
import { Quote, QuotePlan, quoteChange } from './subscription-quote';

/** Élément actif qui compte dans une limite du plan, proposé au choix lors d'un downgrade. */
export interface ExcessItem {
  id: string;
  label: string;
  type: 'PROPERTY' | 'LAND' | 'BUILDING' | 'ANNONCE' | 'STAFF' | 'INVITATION';
}

/** Fonctionnalité limitée dont l'agence dépasse la limite du plan visé. */
export interface FeatureExcess {
  feature: string;
  limit: number;
  used: number;
  items: ExcessItem[];
}

export interface SubscriptionQuote extends Quote {
  currency: string;
  /** Surplus à résoudre (downgrade ou réactivation sur un plan plus petit) ; vide sinon */
  excess: FeatureExcess[];
}

/** Plan en vente, avec ses prix et ses limites. */
const PLAN_SELECT = {
  id: true,
  isActive: true,
  planCategory: true,
  pricings: { select: { billingCycle: true, price: true } },
  planFeatures: {
    where: { enabled: true },
    select: { limit: true, feature: { select: { name: true } } },
  },
} as const;

type PlanRecord = {
  id: string;
  pricings: { billingCycle: BillingCycle; price: { toString(): string } }[];
  planFeatures: { limit: number | null; feature: { name: string } }[];
};

const priceOf = (plan: PlanRecord, cycle: BillingCycle): number | null => {
  const pricing = plan.pricings.find((p) => p.billingCycle === cycle);
  return pricing ? Number(pricing.price.toString()) : null;
};

/** Prix mensuel du plan (ou annuel / 12) : sert à classer un plan au-dessus d'un autre. */
const quotePlanOf = (plan: PlanRecord): QuotePlan => ({
  id: plan.id,
  monthlyPrice:
    priceOf(plan, BillingCycle.MONTHLY) ?? (priceOf(plan, BillingCycle.YEARLY) ?? 0) / 12,
});

/**
 * Changements d'abonnement payants ou programmés (owner) : devis, checkout, downgrade.
 * Les montants viennent tous de `quoteChange` ; le front n'en calcule aucun.
 */
@Injectable()
export class SubscriptionChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly policy: PlanFeaturePolicyService,
  ) {}

  /** Devis d'un passage au plan et au cycle visés, avec le surplus éventuel (owner). */
  async getQuote(
    agencyId: string,
    userId: string,
    planId: string,
    billingCycle: BillingCycle,
  ): Promise<SubscriptionQuote> {
    await this.subscriptions.assertOwner(agencyId, userId);
    const { quote, targetPlan } = await this.buildQuote(agencyId, planId, billingCycle, new Date());
    const excess =
      quote.kind === 'DOWNGRADE' || quote.kind === 'REACTIVATION'
        ? await this.findExcess(agencyId, targetPlan)
        : [];
    return { ...quote, currency: 'XOF', excess };
  }

  /** Devis calculé depuis la base ; réutilisé tel quel par le checkout (montant figé). */
  async buildQuote(agencyId: string, planId: string, billingCycle: BillingCycle, now: Date) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { agencyId },
      select: {
        status: true,
        billingCycle: true,
        price: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        scheduledPlanId: true,
        scheduledBillingCycle: true,
        plan: { select: PLAN_SELECT },
      },
    });
    if (!subscription) {
      throw new HttpError(
        "Aucun abonnement n'est associé à cette agence",
        HttpStatus.NOT_FOUND,
        'SUBSCRIPTION_NOT_FOUND',
      );
    }

    const targetPlan = await this.findPlanForSale(planId);
    const targetPrice = priceOf(targetPlan, billingCycle);
    if (targetPrice === null) {
      throw new HttpError(
        "Ce cycle de facturation n'est pas proposé pour ce plan",
        HttpStatus.BAD_REQUEST,
        'BILLING_CYCLE_UNAVAILABLE',
      );
    }

    const scheduled = await this.findScheduledTarget(
      subscription.scheduledPlanId,
      subscription.scheduledBillingCycle,
    );
    const quote = quoteChange(
      {
        running:
          subscription.status === SubscriptionStatus.ACTIVE &&
          !!subscription.currentPeriodEnd &&
          subscription.currentPeriodEnd > now,
        plan: quotePlanOf(subscription.plan),
        billingCycle: subscription.billingCycle,
        price: subscription.price === null ? 0 : Number(subscription.price.toString()),
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        scheduled,
      },
      { plan: quotePlanOf(targetPlan), billingCycle, price: targetPrice },
      now,
    );
    return { quote, targetPlan };
  }

  /** Plan en vente (actif, par abonnement) ; un plan à la commission n'est jamais proposé. */
  private async findPlanForSale(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      select: PLAN_SELECT,
    });
    if (!plan || !plan.isActive || plan.planCategory !== PlanCategory.SUBSCRIPTION_BASED) {
      throw new HttpError('Plan introuvable ou inactif', HttpStatus.NOT_FOUND, 'PLAN_NOT_FOUND');
    }
    return plan;
  }

  /** Plan et prix de la période suivante quand un downgrade est programmé. */
  private async findScheduledTarget(planId: string | null, cycle: BillingCycle | null) {
    if (!planId || !cycle) return null;
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      select: PLAN_SELECT,
    });
    const price = plan && priceOf(plan, cycle);
    return plan && price !== null ? { plan: quotePlanOf(plan), billingCycle: cycle, price } : null;
  }

  /**
   * Fonctionnalités limitées dont l'usage actif dépasse la limite du plan visé, avec la liste des
   * éléments parmi lesquels l'owner choisit ce qui reste actif. Une fonctionnalité absente du plan
   * visé a une limite de 0 ; une limite nulle (illimitée) n'est jamais en surplus.
   */
  async findExcess(agencyId: string, targetPlan: PlanRecord): Promise<FeatureExcess[]> {
    const limits = new Map(targetPlan.planFeatures.map((pf) => [pf.feature.name, pf.limit]));
    const excess: FeatureExcess[] = [];
    for (const [feature, count] of Object.entries(this.policy.counters)) {
      const limit = limits.has(feature) ? limits.get(feature)! : 0;
      if (limit === null) continue;
      const used = await count(agencyId);
      if (used > limit) {
        excess.push({ feature, limit, used, items: await this.listActiveItems(agencyId, feature) });
      }
    }
    return excess;
  }

  /** Éléments actifs comptés par une fonctionnalité limitée (mêmes critères que les compteurs). */
  private async listActiveItems(agencyId: string, feature: string): Promise<ExcessItem[]> {
    if (feature === FeatureCommercial.PROPERTIES) {
      const where = { agencyId, isActive: true };
      const [properties, lands, buildings] = await Promise.all([
        this.prisma.property.findMany({ where, select: { id: true, title: true } }),
        this.prisma.land.findMany({ where, select: { id: true, title: true } }),
        this.prisma.batiment.findMany({ where, select: { id: true, name: true } }),
      ]);
      return [
        ...properties.map((p) => ({ id: p.id, label: p.title, type: 'PROPERTY' as const })),
        ...lands.map((l) => ({ id: l.id, label: l.title, type: 'LAND' as const })),
        ...buildings.map((b) => ({ id: b.id, label: b.name, type: 'BUILDING' as const })),
      ];
    }
    if (feature === FeatureCommercial.ANNOUNCES) {
      const annonces = await this.prisma.annonce.findMany({
        where: { status: AnnonceStatus.ACTIVE, property: { agencyId } },
        select: { id: true, title: true, property: { select: { title: true } } },
      });
      return annonces.map((a) => ({
        id: a.id,
        label: a.title ?? a.property.title,
        type: 'ANNONCE' as const,
      }));
    }
    const [staff, invitations] = await Promise.all([
      this.prisma.staff.findMany({
        where: { agencyId, isActive: true },
        select: { id: true, user: { select: { name: true, email: true } } },
      }),
      this.prisma.invitation.findMany({
        where: { agencyId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
        select: { id: true, name: true, email: true },
      }),
    ]);
    return [
      ...staff.map((s) => ({
        id: s.id,
        label: s.user.name || s.user.email,
        type: 'STAFF' as const,
      })),
      ...invitations.map((i) => ({
        id: i.id,
        label: `${i.name || i.email} (invitation)`,
        type: 'INVITATION' as const,
      })),
    ];
  }
}
