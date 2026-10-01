import { BillingCycle } from '../../../prisma/generated/enums';

export type QuoteKind = 'RENEWAL' | 'UPGRADE' | 'DOWNGRADE' | 'REACTIVATION';

/** Plan comparé par son prix mensuel : c'est ce qui le classe au-dessus ou en dessous d'un autre. */
export interface QuotePlan {
  id: string;
  monthlyPrice: number;
}

/** Plan visé et son prix (XOF) sur le cycle visé. */
export interface QuoteTarget {
  plan: QuotePlan;
  billingCycle: BillingCycle;
  price: number;
}

export interface QuoteCurrent {
  /** Une période est en cours : abonnement ACTIVE dont l'échéance n'est pas passée. */
  running: boolean;
  plan: QuotePlan;
  billingCycle: BillingCycle | null;
  /** Prix payé pour la période en cours (snapshot de la souscription) */
  price: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  /** Downgrade programmé : prix et cycle de la période suivante */
  scheduled: QuoteTarget | null;
}

export interface Quote {
  kind: QuoteKind;
  /** À payer maintenant (XOF, entier) ; 0 pour un downgrade */
  amount: number;
  /** Date à laquelle le changement prend effet */
  effectiveAt: Date;
  /** Échéance après le changement */
  newPeriodEnd: Date;
}

const CYCLE_MONTHS: Record<BillingCycle, number> = { MONTHLY: 1, YEARLY: 12 };

/** Ajoute un cycle de facturation ; un 31 suivi d'un mois de 30 jours reste en fin de mois. */
export function addBillingCycle(from: Date, cycle: BillingCycle): Date {
  const next = new Date(from);
  const dayOfMonth = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + CYCLE_MONTHS[cycle]);
  if (next.getUTCDate() !== dayOfMonth) next.setUTCDate(0);
  return next;
}

/**
 * Devis d'un changement d'abonnement : source unique du montant affiché (`quote`) et facturé
 * (`checkout`). Règles (spec `subscription-checkout`, décisions du 2026-09-30) :
 * - sans période en cours : réactivation plein tarif, période à partir du paiement ;
 * - même plan, même cycle : renouvellement à la suite de l'échéance, au prix du plan programmé ;
 * - plan supérieur ou cycle plus long (jamais plus court) : upgrade immédiat. Même cycle : différence
 *   au prorata, échéance inchangée. Cycle plus long : nouvelle période, moins le crédit restant ;
 * - sinon : downgrade gratuit, appliqué à l'échéance.
 * Les montants sont arrondis à l'unité XOF supérieure.
 */
export function quoteChange(current: QuoteCurrent, target: QuoteTarget, now: Date): Quote {
  const { currentPeriodStart: start, currentPeriodEnd: end } = current;
  if (!current.running || !start || !end || !current.billingCycle) {
    return {
      kind: 'REACTIVATION',
      amount: Math.ceil(target.price),
      effectiveAt: now,
      newPeriodEnd: addBillingCycle(now, target.billingCycle),
    };
  }

  const samePlan = target.plan.id === current.plan.id;
  const cycleDelta = CYCLE_MONTHS[target.billingCycle] - CYCLE_MONTHS[current.billingCycle];

  if (samePlan && cycleDelta === 0) {
    const next = current.scheduled ?? target;
    return {
      kind: 'RENEWAL',
      amount: Math.ceil(next.price),
      effectiveAt: end,
      newPeriodEnd: addBillingCycle(end, next.billingCycle),
    };
  }

  const higherPlan = target.plan.monthlyPrice > current.plan.monthlyPrice;
  const isUpgrade = cycleDelta >= 0 && (higherPlan || (samePlan && cycleDelta > 0));
  if (!isUpgrade) {
    return {
      kind: 'DOWNGRADE',
      amount: 0,
      effectiveAt: end,
      newPeriodEnd: addBillingCycle(end, target.billingCycle),
    };
  }

  // Part de la période en cours encore à consommer
  const remaining = Math.max(end.getTime() - now.getTime(), 0) / (end.getTime() - start.getTime());
  if (cycleDelta === 0) {
    return {
      kind: 'UPGRADE',
      amount: Math.max(Math.ceil((target.price - current.price) * remaining), 0),
      effectiveAt: now,
      newPeriodEnd: end,
    };
  }
  return {
    kind: 'UPGRADE',
    amount: Math.max(Math.ceil(target.price - current.price * remaining), 0),
    effectiveAt: now,
    newPeriodEnd: addBillingCycle(now, target.billingCycle),
  };
}
