import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { FeatureCommercial } from '../../config/enum';
import { AgencyService } from '../agency/agency.service';
import {
  AnnonceStatus,
  BillingCycle,
  BookingStatus,
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
import { todayCalendarDate } from '../rentals/calendar-date';

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

/** État de la résiliation après `cancel` ou `resume`. */
export interface CancellationState {
  cancelAtPeriodEnd: boolean;
  /** Fin de la période en cours ; null si l'abonnement n'a pas d'échéance enregistrée */
  activeUntil: Date | null;
}

/** Ce que la résiliation change à l'échéance. */
export interface CancelImpact {
  activeUntil: Date | null;
  /** Annonces en ligne, masquées à l'échéance */
  annonces: { online: number };
  /** Membres actifs, qui passeront en lecture seule */
  members: { active: number };
  /** Réservations confirmées à venir, qui restent à honorer */
  bookings: { upcoming: number };
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
  private readonly logger = new Logger(SubscriptionService.name);

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

  /**
   * Job horaire d'expiration. Une résiliation (demande explicite de l'owner) est toujours
   * appliquée à l'échéance. Les périodes simplement non renouvelées n'expirent qu'avec
   * `SUBSCRIPTION_EXPIRY_ENABLED=true` : sans renouvellement en ligne (module checkout), cela
   * bloquerait toutes les agences dont la première période est déjà terminée.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runExpiryJob(): Promise<void> {
    await this.expireEndedPeriods(new Date(), process.env.SUBSCRIPTION_EXPIRY_ENABLED === 'true');
  }

  /**
   * Un abonnement actif dont la période est terminée passe INACTIVE : résilié, ou aussi non
   * renouvelé si `includeUnrenewed`. Idempotent. Effets : tableau de bord en lecture seule
   * (`ActiveSubscriptionGuard`) et annonces masquées (`publicAnnonceWhere`).
   */
  async expireEndedPeriods(now = new Date(), includeUnrenewed = true): Promise<number> {
    const { count } = await this.prisma.subscription.updateMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { lt: now },
        ...(includeUnrenewed ? {} : { cancelAtPeriodEnd: true }),
      },
      data: { status: SubscriptionStatus.INACTIVE },
    });
    if (count > 0) this.logger.log(`${count} abonnement(s) expiré(s)`);
    return count;
  }

  /**
   * Résiliation en fin de période (owner) : rien ne change avant `currentPeriodEnd`, puis le job
   * d'expiration passe l'abonnement INACTIVE. Idempotent.
   */
  async cancel(agencyId: string, userId: string): Promise<CancellationState> {
    const subscription = await this.findRunningSubscription(agencyId, userId);
    if (!subscription.cancelAtPeriodEnd) {
      await this.prisma.subscription.update({
        where: { agencyId },
        data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
      });
    }
    return { cancelAtPeriodEnd: true, activeUntil: subscription.currentPeriodEnd };
  }

  /**
   * Annule une résiliation programmée, sans paiement (owner). Après expiration, la réactivation
   * passe par un nouveau paiement : `409 SUBSCRIPTION_EXPIRED`. Idempotent.
   */
  async resume(agencyId: string, userId: string): Promise<CancellationState> {
    const subscription = await this.findRunningSubscription(agencyId, userId);
    if (subscription.cancelAtPeriodEnd) {
      await this.prisma.subscription.update({
        where: { agencyId },
        data: { cancelAtPeriodEnd: false, canceledAt: null },
      });
    }
    return { cancelAtPeriodEnd: false, activeUntil: subscription.currentPeriodEnd };
  }

  /** Ce que la résiliation entraîne à l'échéance, affiché avant de confirmer (owner). */
  async getCancelImpact(agencyId: string, userId: string): Promise<CancelImpact> {
    const subscription = await this.findRunningSubscription(agencyId, userId);
    const [online, active, upcoming] = await Promise.all([
      this.prisma.annonce.count({
        where: { status: AnnonceStatus.ACTIVE, property: { agencyId } },
      }),
      this.prisma.staff.count({ where: { agencyId, isActive: true } }),
      this.prisma.booking.count({
        where: { agencyId, status: BookingStatus.CONFIRMED, endDate: { gte: todayCalendarDate() } },
      }),
    ]);
    return {
      activeUntil: subscription.currentPeriodEnd,
      annonces: { online },
      members: { active },
      bookings: { upcoming },
    };
  }

  /** Souscription encore en cours de l'agence (owner) : 404 sans souscription, 409 si expirée. */
  private async findRunningSubscription(agencyId: string, userId: string) {
    await this.assertOwner(agencyId, userId);
    const subscription = await this.prisma.subscription.findUnique({
      where: { agencyId },
      select: { status: true, cancelAtPeriodEnd: true, currentPeriodEnd: true },
    });
    if (!subscription) {
      throw new HttpError(
        "Aucun abonnement n'est associé à cette agence",
        HttpStatus.NOT_FOUND,
        'SUBSCRIPTION_NOT_FOUND',
      );
    }
    if (subscription.status === SubscriptionStatus.INACTIVE) {
      throw new HttpError(
        'Cet abonnement a expiré : un nouveau paiement est nécessaire pour le réactiver',
        HttpStatus.CONFLICT,
        'SUBSCRIPTION_EXPIRED',
      );
    }
    return subscription;
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
