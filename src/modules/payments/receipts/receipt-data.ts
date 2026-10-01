import { Prisma } from '../../../../prisma/generated/client';
import { PaymentStatus } from '../../../../prisma/generated/enums';
import { PrismaService } from '../../../database/prisma.service';
import { addBillingCycle } from '../../packs/subscription-quote';
import type { ReceiptAgency } from './issue-receipt';
import type { ReceiptData } from './receipt-pdf';

/** Seules ces clés de `metadata` sont lues (celle d'une inscription contient des données sensibles). */
export type PaymentPeriodMetadata = {
  periodStart?: string;
  periodEnd?: string;
  billingCycle?: 'MONTHLY' | 'YEARLY';
};

/**
 * Période couverte par un paiement : enregistrée à son application, sinon (inscriptions
 * anciennes) déduite du paiement et du cycle choisi.
 */
export function paymentPeriod(metadata: unknown, paidAt: Date | null) {
  const meta = (metadata ?? {}) as PaymentPeriodMetadata;
  const derivedEnd =
    !meta.periodEnd && paidAt && meta.billingCycle
      ? addBillingCycle(paidAt, meta.billingCycle)
      : null;
  return {
    billingCycle: meta.billingCycle ?? null,
    periodStart: meta.periodStart ? new Date(meta.periodStart) : derivedEnd ? paidAt : null,
    periodEnd: meta.periodEnd ? new Date(meta.periodEnd) : derivedEnd,
  };
}

/**
 * Données figées du reçu d'un paiement payé de l'agence, ou null (autre agence, pas payé, pas de
 * reçu). Le filtre `agencyId` est toujours appliqué : pas d'accès au reçu d'une autre agence.
 */
export async function findReceiptData(
  prisma: PrismaService | Prisma.TransactionClient,
  where: { agencyId: string } & ({ id: string } | { naboo_order_id: string }),
): Promise<ReceiptData | null> {
  const payment = await prisma.paymentTransaction.findFirst({
    where: { ...where, status: PaymentStatus.PAID, receiptNumber: { not: null } },
    select: {
      naboo_order_id: true,
      amount_to_pay: true,
      confirmed_at: true,
      updatedAt: true,
      metadata: true,
      receiptNumber: true,
      receiptAgency: true,
      plan: { select: { name: true } },
    },
  });
  if (!payment?.receiptNumber || !payment.receiptAgency) return null;
  const paidAt = payment.confirmed_at ?? payment.updatedAt;
  return {
    number: payment.receiptNumber,
    paidAt,
    amount: Number(payment.amount_to_pay.toString()),
    plan: payment.plan.name,
    ...paymentPeriod(payment.metadata, paidAt),
    orderId: payment.naboo_order_id,
    agency: payment.receiptAgency as unknown as ReceiptAgency,
  };
}
