import { Prisma } from '../../../../prisma/generated/client';

type Tx = Prisma.TransactionClient;

/** Agence telle qu'au jour du paiement, imprimée sur le reçu (ne change plus ensuite). */
export interface ReceiptAgency {
  name: string;
  companyName: string | null;
  legalForm: string | null;
  ninea: string | null;
  rccm: string | null;
  /** Adresse de facturation, sinon celle de l'agence */
  address: string;
  /** E-mail de facturation, sinon celui de l'agence */
  email: string;
}

/** « KRZ-2026-000042 » : préfixe, année du paiement, rang sur 6 chiffres (continu, toutes années). */
export const formatReceiptNumber = (rank: number | bigint, paidAt: Date) =>
  `KRZ-${paidAt.getUTCFullYear()}-${String(rank).padStart(6, '0')}`;

/**
 * Attribue son reçu à un paiement qui vient de passer payé, **dans la transaction de ce
 * passage** : numéro tiré de la séquence (unique même en concurrence) et copie de l'agence.
 * Appelé une seule fois par paiement (la transaction réclame d'abord le paiement).
 */
export async function issueReceipt(
  tx: Tx,
  orderId: string,
  agencyId: string,
  paidAt: Date,
): Promise<string> {
  const [{ rank }] = await tx.$queryRaw<{ rank: bigint }[]>`
    SELECT nextval('receipt_number_seq') AS rank`;
  const agency = await tx.agency.findUniqueOrThrow({
    where: { id: agencyId },
    select: {
      name: true,
      address: true,
      email: true,
      companyName: true,
      legalForm: true,
      ninea: true,
      rccm: true,
      billingAddress: true,
      billingEmail: true,
    },
  });
  const receiptAgency: ReceiptAgency = {
    name: agency.name,
    companyName: agency.companyName,
    legalForm: agency.legalForm,
    ninea: agency.ninea,
    rccm: agency.rccm,
    address: agency.billingAddress ?? agency.address,
    email: agency.billingEmail ?? agency.email,
  };
  const receiptNumber = formatReceiptNumber(rank, paidAt);
  await tx.paymentTransaction.update({
    where: { naboo_order_id: orderId },
    data: { receiptNumber, receiptAgency: receiptAgency as object },
  });
  return receiptNumber;
}
