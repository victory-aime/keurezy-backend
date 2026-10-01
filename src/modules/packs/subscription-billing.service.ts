import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { PrismaService } from '../../database/prisma.service';
import { FeatureCommercial } from '../../config/enum';
import {
  AnnonceStatus,
  InvitationStatus,
  PaymentKind,
  PaymentStatus,
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

    const applied = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.paymentTransaction.updateMany({
        where: { naboo_order_id: orderId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.PAID, confirmed_at: paidOn },
      });
      if (claim.count !== 1) return false;
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
      return true;
    });
    if (applied) this.logger.log(`Paiement ${payment.kind} appliqué — agence ${agencyId}`);
    return applied;
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
          if (claim.count !== 1) return false;
          await this.deactivateExcess(tx, agencyId, (change.scheduledKeep ?? []) as KeepSelection);
          return true;
        });
        if (done) applied++;
      } catch (error) {
        this.logger.error(`Downgrade de l'agence ${agencyId} non appliqué : ${String(error)}`);
      }
    }
    if (applied > 0) this.logger.log(`${applied} downgrade(s) appliqué(s)`);
    return applied;
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
