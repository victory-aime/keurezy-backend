import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { PrismaService } from '../../database/prisma.service';
import { NabooService } from '../payments/services/naboo.service';
import { DomainEventBus } from '../events/domain-events';
import { HttpError } from '../../config/http.error';
import { FeatureCommercial } from '../../config/enum';
import {
  AnnonceStatus,
  BillingCycle,
  InvitationStatus,
  PaymentKind,
  PaymentStatus,
  SubscriptionStatus,
} from '../../../prisma/generated/enums';
import { PlanFeaturePolicyService } from './plan-feature-policy.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionBillingService } from './subscription-billing.service';
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

/** Choix de l'owner : éléments gardés actifs, par fonctionnalité limitée. */
export type KeepSelection = { feature: string; ids: string[] }[];

/** Ce que le webhook relit pour appliquer un paiement d'abonnement. */
export interface SubscriptionCheckoutMetadata {
  planId: string;
  billingCycle: BillingCycle;
  keep: KeepSelection;
}

/** Clé d'idempotence envoyée par le client : une par intention de paiement. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,100}$/;

const NABOO_TO_LOCAL: Record<string, PaymentStatus> = {
  cancelled: PaymentStatus.CANCELLED,
  failed: PaymentStatus.FAILED,
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export interface SubscriptionQuote extends Quote {
  currency: string;
  /** Surplus à résoudre (downgrade ou réactivation sur un plan plus petit) ; vide sinon */
  excess: FeatureExcess[];
}

/** Plan en vente, avec ses prix et ses limites. */
const PLAN_SELECT = {
  id: true,
  isActive: true,
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
  private readonly logger = new Logger(SubscriptionChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
    private readonly policy: PlanFeaturePolicyService,
    private readonly naboo: NabooService,
    private readonly events: DomainEventBus,
    private readonly billing: SubscriptionBillingService,
  ) {}

  /**
   * Crée le checkout NabooPay d'un renouvellement, d'un upgrade ou d'une réactivation (owner).
   * Le montant est celui du devis recalculé maintenant, figé dans la transaction.
   *
   * Idempotence : une même `idempotencyKey` renvoie toujours le même checkout. Sans elle, un double
   * clic ou un retry réseau créerait deux paiements que l'owner pourrait régler tous les deux.
   * Deux requêtes simultanées sont départagées par la contrainte unique.
   */
  async createCheckout(
    agencyId: string,
    userId: string,
    target: { planId: string; billingCycle: BillingCycle; keep?: KeepSelection },
    idempotencyKey: string | undefined,
  ): Promise<{ checkoutUrl: string; orderId: string }> {
    const ownerUserId = await this.subscriptions.assertOwner(agencyId, userId);
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new HttpError(
        "En-tête Idempotency-Key manquant ou invalide (16 à 100 caractères alphanumériques, '-' ou '_')",
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }

    const replay = await this.findCheckoutByKey(idempotencyKey, agencyId, target);
    if (replay) return replay;

    const { quote, targetPlan } = await this.buildQuote(
      agencyId,
      target.planId,
      target.billingCycle,
      new Date(),
    );
    if (quote.kind === 'DOWNGRADE') {
      throw new HttpError(
        "Un downgrade ne se paie pas : il se programme pour l'échéance",
        HttpStatus.BAD_REQUEST,
        'DOWNGRADE_NOT_PAYABLE',
      );
    }
    if (quote.amount <= 0) {
      // ponytail: crédit restant ≥ prix visé, impossible avec les grilles actuelles ; à traiter
      // (application sans paiement) si une grille le permet un jour
      throw new HttpError('Aucun montant à payer', HttpStatus.BAD_REQUEST, 'NOTHING_TO_PAY');
    }
    const keep =
      quote.kind === 'REACTIVATION'
        ? this.validateKeep(await this.findExcess(agencyId, targetPlan), target.keep ?? [])
        : [];

    const agency = await this.prisma.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { name: true },
    });
    const planName = await this.prisma.subscriptionPlan.findUniqueOrThrow({
      where: { id: targetPlan.id },
      select: { name: true },
    });
    const returnUrl = `${process.env.NABOOPAY_FRONT_URL}/dashboard/subscription?payment=`;
    const nabooTx = await this.naboo.createTransaction({
      products: [
        {
          name: `Abonnement ${planName.name}`,
          price: quote.amount,
          quantity: 1,
          description: `${quote.kind} de l'abonnement de l'agence ${agency.name}`,
        },
      ],
      successUrl: `${returnUrl}success`,
      errorUrl: `${returnUrl}error`,
    });

    const metadata: SubscriptionCheckoutMetadata = {
      planId: targetPlan.id,
      billingCycle: target.billingCycle,
      keep,
    };
    try {
      await this.prisma.paymentTransaction.create({
        data: {
          naboo_order_id: nabooTx.order_id,
          checkout_url: nabooTx.checkout_url,
          amount_to_pay: quote.amount,
          planId: targetPlan.id,
          userId: ownerUserId ?? null,
          agencyId,
          kind: quote.kind as PaymentKind,
          idempotencyKey,
          status: PaymentStatus.PENDING,
          metadata: metadata as object,
        },
      });
    } catch (error) {
      // Requête jumelle arrivée la première : son checkout fait foi, celui-ci n'est jamais montré
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.findCheckoutByKey(idempotencyKey, agencyId, target);
      if (winner) return winner;
      throw error;
    }
    this.logger.log(`Checkout ${quote.kind} créé — agence ${agencyId}, order ${nabooTx.order_id}`);
    return { checkoutUrl: nabooTx.checkout_url, orderId: nabooTx.order_id };
  }

  /**
   * Checkout déjà créé avec cette clé. La même clé pour une autre demande (ou une autre agence)
   * est une erreur du client : on refuse plutôt que de renvoyer un paiement qui ne correspond pas.
   */
  private async findCheckoutByKey(
    idempotencyKey: string,
    agencyId: string,
    target: { planId: string; billingCycle: BillingCycle },
  ) {
    const existing = await this.prisma.paymentTransaction.findUnique({
      where: { idempotencyKey },
      select: { agencyId: true, naboo_order_id: true, checkout_url: true, metadata: true },
    });
    if (!existing) return null;
    const meta = existing.metadata as unknown as SubscriptionCheckoutMetadata;
    if (
      existing.agencyId !== agencyId ||
      meta.planId !== target.planId ||
      meta.billingCycle !== target.billingCycle
    ) {
      throw new HttpError(
        'Cette clé d’idempotence a déjà servi pour une autre demande',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    return { checkoutUrl: existing.checkout_url, orderId: existing.naboo_order_id };
  }

  /**
   * Statut d'un paiement d'abonnement de l'agence (owner), pour le retour depuis NabooPay.
   * Rattrapage : si NabooPay dit « payé » avant l'arrivée du webhook, on émet la confirmation ;
   * son application reste unique (clé `orderId`).
   */
  async getPaymentStatus(
    agencyId: string,
    userId: string,
    orderId: string,
  ): Promise<{ status: PaymentStatus }> {
    await this.subscriptions.assertOwner(agencyId, userId);
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { naboo_order_id: orderId, agencyId, kind: { not: PaymentKind.ONBOARDING } },
      select: { status: true },
    });
    if (!transaction) {
      throw new HttpError('Paiement introuvable', HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND');
    }
    if (transaction.status !== PaymentStatus.PENDING) return { status: transaction.status };

    const nabooTx = await this.naboo.getTransactionById(orderId);
    if (nabooTx.transaction_status === 'paid') {
      this.events.emit('subscription.payment.confirmed', {
        orderId,
        paidAt: nabooTx.paid_at ?? new Date().toISOString(),
        paidAmount: Number(nabooTx.amount),
      });
    } else if (NABOO_TO_LOCAL[nabooTx.transaction_status]) {
      await this.prisma.paymentTransaction.updateMany({
        where: { naboo_order_id: orderId, status: PaymentStatus.PENDING },
        data: { status: NABOO_TO_LOCAL[nabooTx.transaction_status] },
      });
      return { status: NABOO_TO_LOCAL[nabooTx.transaction_status] };
    }
    return { status: PaymentStatus.PENDING };
  }

  /**
   * Programme un downgrade pour l'échéance (owner), avec les éléments gardés actifs. Remplace un
   * downgrade déjà programmé (modification du choix). Rien ne change avant la date d'effet.
   */
  async scheduleChange(
    agencyId: string,
    userId: string,
    target: { planId: string; billingCycle: BillingCycle; keep?: KeepSelection },
  ) {
    await this.subscriptions.assertOwner(agencyId, userId);
    const { quote, targetPlan, currentPlanId } = await this.buildQuote(
      agencyId,
      target.planId,
      target.billingCycle,
      new Date(),
    );
    // Agence expirée qui choisit le Gratuit : rien à payer, le passage est immédiat. Déjà au
    // Gratuit : pas de changement.
    const freeNow =
      quote.kind === 'REACTIVATION' && quote.amount === 0 && targetPlan.id !== currentPlanId;
    if (quote.kind !== 'DOWNGRADE' && !freeNow) {
      throw new HttpError(
        "Ce changement n'est pas un downgrade : il se paie maintenant",
        HttpStatus.BAD_REQUEST,
        'NOT_A_DOWNGRADE',
      );
    }
    const keep = this.validateKeep(await this.findExcess(agencyId, targetPlan), target.keep ?? []);
    if (freeNow) {
      await this.billing.activateFreePlan(agencyId, targetPlan.id, keep);
      return {
        planId: targetPlan.id,
        billingCycle: target.billingCycle,
        effectiveAt: quote.effectiveAt,
        keep,
      };
    }
    await this.prisma.subscription.update({
      where: { agencyId },
      data: {
        scheduledPlanId: targetPlan.id,
        scheduledBillingCycle: target.billingCycle,
        scheduledKeep: keep,
        scheduledAt: quote.effectiveAt,
      },
    });
    return {
      planId: targetPlan.id,
      billingCycle: target.billingCycle,
      effectiveAt: quote.effectiveAt,
      keep,
    };
  }

  /** Annule le downgrade programmé (owner). Idempotent. */
  async cancelScheduledChange(agencyId: string, userId: string) {
    await this.subscriptions.assertOwner(agencyId, userId);
    await this.prisma.subscription.updateMany({
      where: { agencyId },
      data: {
        scheduledPlanId: null,
        scheduledBillingCycle: null,
        scheduledKeep: Prisma.DbNull,
        scheduledAt: null,
      },
    });
    return { scheduledChange: null };
  }

  /**
   * Vérifie le choix de l'owner face au surplus : pour chaque fonctionnalité en surplus, des
   * éléments actifs de l'agence, sans dépasser la limite visée. Renvoie le choix normalisé
   * (une entrée par fonctionnalité en surplus).
   */
  validateKeep(excess: FeatureExcess[], keep: KeepSelection): KeepSelection {
    return excess.map(({ feature, limit, items }) => {
      const chosen = keep.find((k) => k.feature === feature)?.ids;
      if (!chosen && limit > 0) {
        throw new HttpError(
          `Choisissez les éléments à garder actifs pour « ${feature} »`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SELECTION_REQUIRED',
        );
      }
      const ids = chosen ?? [];
      const known = new Set(items.map((item) => item.id));
      if (ids.some((id) => !known.has(id))) {
        throw new HttpError(
          'Le choix contient un élément inconnu ou déjà inactif',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SELECTION_INVALID',
        );
      }
      if (ids.length > limit) {
        throw new HttpError(
          `Vous pouvez garder au plus ${limit} élément(s) pour « ${feature} »`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'SELECTION_EXCEEDS_LIMIT',
        );
      }
      return { feature, ids };
    });
  }

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
    return { quote, targetPlan, currentPlanId: subscription.plan.id };
  }

  /** Plan en vente (actif). */
  private async findPlanForSale(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
      select: PLAN_SELECT,
    });
    if (!plan || !plan.isActive) {
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
