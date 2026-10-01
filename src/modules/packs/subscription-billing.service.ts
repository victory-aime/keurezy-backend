import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { PrismaService } from '../../database/prisma.service';
import { FeatureCommercial } from '../../config/enum';
import {
  AnnonceStatus,
  InvitationStatus,
  PaymentKind,
  PaymentStatus,
  Plan,
  SubscriptionStatus,
} from '../../../prisma/generated/enums';
import { DomainEventBus, SubscriptionPaymentConfirmedEvent } from '../events/domain-events';
import { addBillingCycle } from './subscription-quote';
import type { KeepSelection, SubscriptionCheckoutMetadata } from './subscription-change.service';

type Tx = Prisma.TransactionClient;

/**
 * Période d'un abonnement Gratuit : ni cycle ni échéance, donc ni rappel, ni expiration, ni
 * résiliation (les jobs ne regardent que `currentPeriodEnd`).
 */
const freePeriod = (now: Date) => ({
  billingCycle: null,
  currentPeriodStart: now,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  lastRenewalReminder: null,
});

const NO_SCHEDULED_CHANGE = {
  scheduledPlanId: null,
  scheduledBillingCycle: null,
  scheduledKeep: Prisma.DbNull,
  scheduledAt: null,
};

/**
 * Applique les paiements d'abonnement confirmés par NabooPay, et les désactivations d'un
 * downgrade. Écoute `subscription.payment.confirmed` (webhook ou polling) : le module paiements
 * ne dépend pas du module abonnement.
 */
@Injectable()
export class SubscriptionBillingService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventBus,
  ) {}

  onModuleInit() {
    this.events.on('subscription.payment.confirmed', async (event) => {
      await this.applyPayment(event);
    });
  }

  /**
   * Applique un paiement une seule fois. Clé d'idempotence : `orderId`. La transaction est
   * réclamée (`PENDING` → `PAID`, compte = 1) dans la même transaction que l'application : un
   * webhook et un polling simultanés n'appliquent qu'une fois, et un échec remet tout en attente
   * (le prochain webhook ou polling réessaie). Renvoie true si le paiement a été appliqué ici.
   */
  async applyPayment({ orderId, paidAt, paidAmount }: SubscriptionPaymentConfirmedEvent) {
    const payment = await this.prisma.paymentTransaction.findUnique({
      where: { naboo_order_id: orderId },
      select: { kind: true, agencyId: true, amount_to_pay: true, status: true, metadata: true },
    });
    if (!payment?.agencyId || payment.kind === PaymentKind.ONBOARDING) return false;
    if (payment.status !== PaymentStatus.PENDING) return false;

    if (!(paidAmount >= Number(payment.amount_to_pay.toString()))) {
      // Montant réglé inférieur au devis figé : rien n'est appliqué, à vérifier à la main
      this.logger.error(
        `Paiement ${orderId} : ${paidAmount} réglé pour ${payment.amount_to_pay.toString()} attendu — non appliqué`,
      );
      await this.prisma.paymentTransaction.updateMany({
        where: { naboo_order_id: orderId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      return false;
    }

    const paidOn = Number.isNaN(Date.parse(paidAt)) ? new Date() : new Date(paidAt);
    const agencyId = payment.agencyId;
    const meta = payment.metadata as unknown as SubscriptionCheckoutMetadata;

    const period = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.paymentTransaction.updateMany({
        where: { naboo_order_id: orderId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.PAID, confirmed_at: paidOn },
      });
      if (claim.count !== 1) return null;
      const period = await this.applyToSubscription(tx, agencyId, payment.kind, meta, paidOn);
      // Période couverte, pour l'historique de facturation
      await tx.paymentTransaction.update({
        where: { naboo_order_id: orderId },
        data: {
          metadata: {
            ...meta,
            periodStart: period.start.toISOString(),
            periodEnd: period.end.toISOString(),
          },
        },
      });
      return period;
    });
    if (!period) return false;
    this.logger.log(`Paiement ${payment.kind} appliqué — agence ${agencyId}`);
    this.events.emit('subscription.payment.applied', {
      agencyId,
      kind: payment.kind as 'RENEWAL' | 'UPGRADE' | 'REACTIVATION',
      amount: paidAmount,
      periodStart: period.start,
      periodEnd: period.end,
    });
    return true;
  }

  /**
   * Effet d'un paiement sur l'abonnement :
   * - sans période en cours (expiré, échu) : nouvelle période à partir du paiement ;
   * - renouvellement : période suivante à la suite de l'échéance (le downgrade programmé garde
   *   sa date d'effet, `scheduledAt`) ;
   * - upgrade sur le même cycle : plan et prix changent, échéance inchangée ; cycle plus long :
   *   nouvelle période à partir du paiement. Un upgrade annule le downgrade programmé.
   * Tout paiement annule une résiliation programmée et réarme les rappels.
   */
  private async applyToSubscription(
    tx: Tx,
    agencyId: string,
    kind: PaymentKind,
    meta: SubscriptionCheckoutMetadata,
    paidOn: Date,
  ): Promise<{ start: Date; end: Date }> {
    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { agencyId },
      select: {
        status: true,
        billingCycle: true,
        currentPeriodEnd: true,
        scheduledPlanId: true,
        scheduledBillingCycle: true,
      },
    });
    const pricing = await tx.planPricing.findUniqueOrThrow({
      where: { planId_billingCycle: { planId: meta.planId, billingCycle: meta.billingCycle } },
      select: { price: true, currency: true },
    });
    const running =
      subscription.status === SubscriptionStatus.ACTIVE &&
      !!subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd > paidOn;

    const common = {
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      lastRenewalReminder: null,
    };
    const newPlan = {
      planId: meta.planId,
      billingCycle: meta.billingCycle,
      price: pricing.price,
      currency: pricing.currency,
      ...NO_SCHEDULED_CHANGE,
    };

    if (!running) {
      const end = addBillingCycle(paidOn, meta.billingCycle);
      await tx.subscription.update({
        where: { agencyId },
        data: { ...common, ...newPlan, currentPeriodStart: paidOn, currentPeriodEnd: end },
      });
      if (kind === PaymentKind.REACTIVATION) await this.deactivateExcess(tx, agencyId, meta.keep);
      return { start: paidOn, end };
    }

    const periodEnd = subscription.currentPeriodEnd!;
    if (kind === PaymentKind.RENEWAL) {
      const nextCycle = subscription.scheduledBillingCycle ?? meta.billingCycle;
      const end = addBillingCycle(periodEnd, nextCycle);
      await tx.subscription.update({
        where: { agencyId },
        // La période payée commence à l'échéance : le prorata d'un upgrade ultérieur reste juste
        data: {
          ...common,
          // Prix payé pour la période suivante ; avec un downgrade programmé, le job le pose
          // à la date d'effet en même temps que le nouveau plan
          ...(subscription.scheduledPlanId
            ? {}
            : { price: pricing.price, currency: pricing.currency }),
          currentPeriodStart: periodEnd,
          currentPeriodEnd: end,
        },
      });
      return { start: periodEnd, end };
    }

    const sameCycle = meta.billingCycle === subscription.billingCycle;
    const end = sameCycle ? periodEnd : addBillingCycle(paidOn, meta.billingCycle);
    await tx.subscription.update({
      where: { agencyId },
      data: {
        ...common,
        ...newPlan,
        ...(sameCycle ? {} : { currentPeriodStart: paidOn, currentPeriodEnd: end }),
      },
    });
    // Upgrade : la somme payée couvre le reste de la période (même cycle) ou la nouvelle période
    return { start: paidOn, end };
  }

  /**
   * Applique les downgrades dont la date d'effet (`scheduledAt`) est passée : plan, cycle et prix
   * du plan programmé, puis désactivation de ce que l'owner n'a pas gardé, en une transaction par
   * agence. Idempotent (réclamation sur `scheduledAt`). Une agence en échec est journalisée et
   * retentée au prochain passage, sans bloquer les autres.
   *
   * ponytail: une fonctionnalité passée en surplus après le choix (création entre-temps) n'est
   * pas réduite ; l'agence reste simplement bloquée à la création jusqu'à revenir sous la limite.
   */
  async applyScheduledChanges(now = new Date()): Promise<number> {
    const due = await this.prisma.subscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE, scheduledAt: { lt: now } },
      select: {
        agencyId: true,
        scheduledPlanId: true,
        scheduledBillingCycle: true,
        scheduledKeep: true,
        currentPeriodEnd: true,
        plan: { select: { name: true } },
      },
    });
    let applied = 0;
    for (const change of due) {
      const { agencyId, scheduledPlanId: planId, scheduledBillingCycle: billingCycle } = change;
      if (!planId || !billingCycle) continue;
      try {
        const done = await this.prisma.$transaction(async (tx) => {
          const pricing = await tx.planPricing.findUniqueOrThrow({
            where: { planId_billingCycle: { planId, billingCycle } },
            select: { price: true, currency: true },
          });
          const free = Number(pricing.price.toString()) === 0;
          const claim = await tx.subscription.updateMany({
            where: { agencyId, scheduledAt: { lt: now } },
            data: {
              planId,
              billingCycle,
              price: pricing.price,
              currency: pricing.currency,
              ...NO_SCHEDULED_CHANGE,
              ...(free ? freePeriod(now) : {}),
            },
          });
          if (claim.count !== 1) return null;
          await this.deactivateExcess(tx, agencyId, (change.scheduledKeep ?? []) as KeepSelection);
          return { free };
        });
        if (!done) continue;
        applied++;
        if (done.free) {
          this.events.emit('subscription.moved.to.free', {
            agencyId,
            reason: 'SCHEDULED',
            previousPlan: change.plan.name,
          });
        } else if (change.currentPeriodEnd && change.currentPeriodEnd > now) {
          // Période déjà renouvelée : le nouveau plan continue. Sinon, l'expiration qui suit le
          // fait passer au Gratuit, et c'est cet e-mail-là qui part.
          this.events.emit('subscription.downgrade.applied', { agencyId });
        }
      } catch (error) {
        this.logger.error(`Downgrade de l'agence ${agencyId} non appliqué : ${String(error)}`);
      }
    }
    if (applied > 0) this.logger.log(`${applied} downgrade(s) appliqué(s)`);
    return applied;
  }

  /**
   * Fin de période sans renouvellement (résiliation, ou non-paiement si `includeUnrenewed`) :
   * l'agence passe au plan Gratuit au lieu de devenir inactive. Les abonnements déjà INACTIVE
   * (avant le plan Gratuit) y passent aussi. Une transaction par agence, réclamée (relance du job
   * ou deux instances : un seul passage) ; une agence en échec n'empêche pas les autres.
   */
  async expireToFree(now = new Date(), includeUnrenewed = true): Promise<number> {
    const where: Prisma.SubscriptionWhereInput = {
      OR: [
        {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: { lt: now },
          ...(includeUnrenewed ? {} : { cancelAtPeriodEnd: true }),
        },
        { status: SubscriptionStatus.INACTIVE },
      ],
    };
    const due = await this.prisma.subscription.findMany({
      where,
      select: { agencyId: true, plan: { select: { name: true } } },
    });
    let moved = 0;
    for (const { agencyId, plan } of due) {
      try {
        const done = await this.prisma.$transaction(async (tx) => {
          const claim = await tx.subscription.updateMany({
            where: { agencyId, ...where },
            data: { currentPeriodEnd: null },
          });
          if (claim.count !== 1) return false;
          await this.moveToFree(tx, agencyId, now);
          return true;
        });
        if (done) {
          moved++;
          this.events.emit('subscription.moved.to.free', {
            agencyId,
            reason: 'PERIOD_ENDED',
            previousPlan: plan.name,
          });
        }
      } catch (error) {
        this.logger.error(`Passage au Gratuit de l'agence ${agencyId} échoué : ${String(error)}`);
      }
    }
    if (moved > 0) this.logger.log(`${moved} abonnement(s) passé(s) au plan Gratuit`);
    return moved;
  }

  /**
   * Bascule au plan Gratuit sans choix de l'owner (fin de période, fin de la commission) : ce qui
   * dépasse ses limites est désactivé, jamais supprimé ; les éléments les plus anciens restent
   * actifs.
   */
  async moveToFree(tx: Tx, agencyId: string, now: Date) {
    const free = await tx.subscriptionPlan.findUniqueOrThrow({
      where: { name: Plan.FREE_SUB },
      select: {
        id: true,
        planFeatures: {
          where: { enabled: true },
          select: { limit: true, feature: { select: { name: true } } },
        },
      },
    });
    const limits = new Map(free.planFeatures.map((pf) => [pf.feature.name, pf.limit]));
    const keep = await this.oldestWithinLimits(tx, agencyId, limits);
    await tx.subscription.update({
      where: { agencyId },
      data: {
        planId: free.id,
        status: SubscriptionStatus.ACTIVE,
        price: 0,
        currency: 'XOF',
        ...NO_SCHEDULED_CHANGE,
        ...freePeriod(now),
      },
    });
    await this.deactivateExcess(tx, agencyId, keep);
  }

  /**
   * Choix par défaut : pour chaque fonctionnalité limitée, les éléments actifs les plus anciens
   * dans la limite (absente du plan = 0, null = illimitée, rien à couper). Les annonces gardées
   * sont prises parmi celles des biens gardés.
   */
  async oldestWithinLimits(
    tx: Tx,
    agencyId: string,
    limits: Map<string, number | null>,
  ): Promise<KeepSelection> {
    const limitOf = (feature: string) => (limits.has(feature) ? limits.get(feature)! : 0);
    const oldest = <T extends { id: string; createdAt: Date }>(items: T[], limit: number) =>
      [...items]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
        .map((item) => item.id);
    const select = { id: true, createdAt: true };
    const active = { agencyId, isActive: true };
    const keep: KeepSelection = [];

    let keptPropertyIds: string[] | null = null;
    const assetLimit = limitOf(FeatureCommercial.PROPERTIES);
    if (assetLimit !== null) {
      const [properties, lands, buildings] = await Promise.all([
        tx.property.findMany({ where: active, select }),
        tx.land.findMany({ where: active, select }),
        tx.batiment.findMany({ where: active, select }),
      ]);
      const ids = oldest([...properties, ...lands, ...buildings], assetLimit);
      keep.push({ feature: FeatureCommercial.PROPERTIES, ids });
      keptPropertyIds = properties.filter((p) => ids.includes(p.id)).map((p) => p.id);
    }

    const annonceLimit = limitOf(FeatureCommercial.ANNOUNCES);
    if (annonceLimit !== null) {
      const annonces = await tx.annonce.findMany({
        where: {
          status: AnnonceStatus.ACTIVE,
          property: { agencyId },
          ...(keptPropertyIds ? { propertyId: { in: keptPropertyIds } } : {}),
        },
        select,
      });
      keep.push({ feature: FeatureCommercial.ANNOUNCES, ids: oldest(annonces, annonceLimit) });
    }

    const seatLimit = limitOf(FeatureCommercial.USERS);
    if (seatLimit !== null) {
      const [staff, invitations] = await Promise.all([
        tx.staff.findMany({ where: active, select }),
        tx.invitation.findMany({
          where: { agencyId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
          select,
        }),
      ]);
      keep.push({
        feature: FeatureCommercial.USERS,
        ids: oldest([...staff, ...invitations], seatLimit),
      });
    }
    return keep;
  }

  /**
   * Passage immédiat au plan Gratuit d'une agence sans période en cours (expirée) : rien à payer,
   * l'abonnement redevient actif, sans échéance, et ce qui n'a pas été gardé est désactivé.
   */
  async activateFreePlan(agencyId: string, planId: string, keep: KeepSelection, now = new Date()) {
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { agencyId },
        data: {
          planId,
          status: SubscriptionStatus.ACTIVE,
          price: 0,
          currency: 'XOF',
          ...NO_SCHEDULED_CHANGE,
          ...freePeriod(now),
        },
      });
      await this.deactivateExcess(tx, agencyId, keep);
    });
  }

  /**
   * Désactive ce qui n'a pas été gardé, pour chaque fonctionnalité en surplus choisie par l'owner
   * (réactivation sur un plan plus petit, downgrade). Rien n'est supprimé ; un élément créé après
   * le choix est désactivé aussi. Un bien désactivé retire ses annonces en ligne ; un membre
   * désactivé perd ses sessions ; une invitation non gardée est annulée.
   */
  async deactivateExcess(tx: Tx, agencyId: string, keep: KeepSelection) {
    for (const { feature, ids } of keep) {
      const notKept = { notIn: ids };
      if (feature === FeatureCommercial.PROPERTIES) {
        const where = { agencyId, isActive: true, id: notKept };
        const properties = await tx.property.findMany({ where, select: { id: true } });
        await tx.property.updateMany({ where, data: { isActive: false } });
        await tx.land.updateMany({ where, data: { isActive: false } });
        await tx.batiment.updateMany({ where, data: { isActive: false } });
        await tx.annonce.updateMany({
          where: { propertyId: { in: properties.map((p) => p.id) }, status: AnnonceStatus.ACTIVE },
          data: { status: AnnonceStatus.INACTIVE },
        });
      } else if (feature === FeatureCommercial.ANNOUNCES) {
        await tx.annonce.updateMany({
          where: { status: AnnonceStatus.ACTIVE, property: { agencyId }, id: notKept },
          data: { status: AnnonceStatus.INACTIVE },
        });
      } else if (feature === FeatureCommercial.USERS) {
        const where = { agencyId, isActive: true, id: notKept };
        const members = await tx.staff.findMany({ where, select: { userId: true } });
        const userIds = members.map((m) => m.userId);
        await tx.staff.updateMany({ where, data: { isActive: false } });
        await tx.user.updateMany({ where: { id: { in: userIds } }, data: { status: 'INACTIVE' } });
        await tx.session.deleteMany({ where: { userId: { in: userIds } } });
        await tx.invitation.updateMany({
          where: { agencyId, status: InvitationStatus.PENDING, id: notKept },
          data: { status: InvitationStatus.CANCELLED },
        });
      }
    }
  }
}
