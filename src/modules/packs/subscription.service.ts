import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
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
import { FeatureCommercial } from '../../config/enum';
import { AssetType } from './asset-activation';
import { SubscriptionBillingService } from './subscription-billing.service';
import { DomainEventBus } from '../events/domain-events';

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
  /** Downgrade programmé (null sinon) : plan visé, date d'effet et éléments gardés actifs */
  scheduledChange: {
    plan: { id: string; name: Plan };
    billingCycle: BillingCycle;
    effectiveAt: Date;
    keep: { feature: string; ids: string[] }[];
  } | null;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly policy: PlanFeaturePolicyService,
    private readonly billing: SubscriptionBillingService,
    private readonly events: DomainEventBus,
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
        scheduledPlanId: true,
        scheduledBillingCycle: true,
        scheduledAt: true,
        scheduledKeep: true,
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

    const tracked = Object.keys(this.policy.counters).filter((name) => context.features.has(name));
    const usage = await Promise.all(
      tracked.map(async (name) =>
        toUsage(
          this.policy.checkCapacity(context, name, await this.policy.counters[name](agencyId)),
        ),
      ),
    );

    const {
      plan,
      price,
      scheduledPlanId,
      scheduledBillingCycle,
      scheduledAt,
      scheduledKeep,
      ...period
    } = subscription;
    const scheduledPlan = scheduledPlanId
      ? await this.prisma.subscriptionPlan.findUnique({
          where: { id: scheduledPlanId },
          select: { id: true, name: true },
        })
      : null;
    return {
      subscription: {
        ...period,
        plan: { id: plan.id, name: plan.name },
        price: price === null ? null : Number(price.toString()),
        scheduledChange:
          scheduledPlan && scheduledBillingCycle && scheduledAt
            ? {
                plan: scheduledPlan,
                billingCycle: scheduledBillingCycle,
                effectiveAt: scheduledAt,
                keep: (scheduledKeep ?? []) as { feature: string; ids: string[] }[],
              }
            : null,
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
   * Job horaire d'échéance : downgrades programmés, puis expiration. Une résiliation (demande explicite de l'owner) est toujours
   * appliquée à l'échéance. Les périodes simplement non renouvelées n'expirent qu'avec
   * `SUBSCRIPTION_EXPIRY_ENABLED=true` : sans renouvellement en ligne (module checkout), cela
   * bloquerait toutes les agences dont la première période est déjà terminée.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runExpiryJob(): Promise<void> {
    const now = new Date();
    // Le downgrade programmé passe avant : une agence qui n'a pas renouvelé expire sur son
    // nouveau plan, et ses éléments hors choix sont déjà désactivés
    await this.billing.applyScheduledChanges(now);
    await this.expireEndedPeriods(now, process.env.SUBSCRIPTION_EXPIRY_ENABLED === 'true');
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runRenewalReminderJob(): Promise<void> {
    await this.sendRenewalReminders(new Date());
  }

  /**
   * Rappels de renouvellement à J-7, J-3 et J-1 (paiement manuel, pas de prélèvement). Un seul
   * envoi par palier : `lastRenewalReminder` est réclamé avant l'émission (pas de doublon si le
   * job est relancé ou si deux instances tournent). Rien si une résiliation est programmée ; un
   * paiement remet le compteur à zéro et repousse l'échéance hors de la fenêtre.
   */
  async sendRenewalReminders(now = new Date()): Promise<number> {
    const DAY = 86_400_000;
    const due = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 7 * DAY) },
      },
      select: { agencyId: true, currentPeriodEnd: true },
    });
    let sent = 0;
    for (const { agencyId, currentPeriodEnd } of due) {
      const daysLeft = Math.ceil((currentPeriodEnd!.getTime() - now.getTime()) / DAY);
      const tier = daysLeft <= 1 ? 1 : daysLeft <= 3 ? 3 : 7;
      const claim = await this.prisma.subscription.updateMany({
        where: {
          agencyId,
          OR: [{ lastRenewalReminder: null }, { lastRenewalReminder: { gt: tier } }],
        },
        data: { lastRenewalReminder: tier },
      });
      if (claim.count !== 1) continue;
      this.events.emit('subscription.renewal.due', {
        agencyId,
        daysLeft: tier,
        periodEnd: currentPeriodEnd!,
      });
      sent++;
    }
    if (sent > 0) this.logger.log(`${sent} rappel(s) de renouvellement`);
    return sent;
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

  /**
   * Réactive un bien désactivé (par un downgrade), dans la limite `manage_properties` du plan
   * (owner). Idempotent : un bien déjà actif est renvoyé tel quel.
   */
  async activateAsset(
    agencyId: string,
    userId: string,
    asset: { type: AssetType; id: string },
  ): Promise<{ isActive: true }> {
    await this.assertOwner(agencyId, userId);
    const where = { id: asset.id, agencyId };
    const found =
      asset.type === 'PROPERTY'
        ? await this.prisma.property.findFirst({ where, select: { isActive: true } })
        : asset.type === 'LAND'
          ? await this.prisma.land.findFirst({ where, select: { isActive: true } })
          : await this.prisma.batiment.findFirst({ where, select: { isActive: true } });
    if (!found) {
      throw new HttpError('Bien introuvable', HttpStatus.NOT_FOUND, 'ASSET_NOT_FOUND');
    }
    if (found.isActive) return { isActive: true };

    if (!(await this.policy.hasRoomFor(agencyId, FeatureCommercial.PROPERTIES))) {
      throw new HttpError(
        'Votre capacité maximale de biens est atteinte.',
        HttpStatus.FORBIDDEN,
        'PROPERTY_CAPACITY_REACHED',
      );
    }
    const data = { isActive: true };
    if (asset.type === 'PROPERTY')
      await this.prisma.property.update({ where: { id: asset.id }, data });
    else if (asset.type === 'LAND')
      await this.prisma.land.update({ where: { id: asset.id }, data });
    else await this.prisma.batiment.update({ where: { id: asset.id }, data });
    return { isActive: true };
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

  /**
   * L'abonnement (montants compris) n'est visible et modifiable que par le propriétaire.
   * Renvoie le `User.id` de l'owner (pour les tables reliées à User).
   */
  async assertOwner(agencyId: string, userId: string): Promise<string | undefined> {
    const actor = await this.agencyService.agencyAccessControl(agencyId, userId);
    if (actor.type !== 'OWNER') {
      throw new HttpError(
        "Seul le propriétaire de l'agence peut gérer l'abonnement",
        HttpStatus.FORBIDDEN,
        'OWNER_ONLY',
      );
    }
    // `userId` reçu est l'identifiant du profil Owner (@AgencyProfileId) : on renvoie son User.id
    return actor.userOwnerId;
  }
}
