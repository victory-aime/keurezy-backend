import { RentalType } from '../../../prisma/generated/enums';
import type { InvoiceLine, InvoiceRenderData, InvoiceWatermark } from './invoice-pdf';
import type { InvoiceTemplateConfig } from './invoice-template.config';

const RENTAL_LABELS: Record<RentalType, { type: string; unit: [string, string] }> = {
  [RentalType.DAILY]: { type: 'Location journalière', unit: ['jour', 'jours'] },
  [RentalType.NIGHTLY]: { type: 'Location à la nuitée', unit: ['nuit', 'nuits'] },
  [RentalType.MONTHLY]: { type: 'Location mensuelle', unit: ['mois', 'mois'] },
  [RentalType.YEARLY]: { type: 'Location annuelle', unit: ['an', 'ans'] },
};

const day = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });

/** Référence courte et stable d'une réservation, lisible par le client. */
export const bookingReference = (bookingId: string) =>
  `RES-${bookingId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** Réservation telle que la facturation la lit. */
export interface InvoiceableBooking {
  id: string;
  rentalType: RentalType;
  startDate: Date;
  endDate: Date;
  duration: number;
  totalAmount: { toString(): string };
  depositAmount: { toString(): string };
  property: { title: string; address: string | null; city: string | null };
  client: { phone: string | null; user: { name: string; email: string } } | null;
}

/** Informations de réservation et de bien imprimées sur la facture (variables comprises). */
export function bookingDetails(booking: InvoiceableBooking) {
  const labels = RENTAL_LABELS[booking.rentalType];
  return {
    booking: {
      reference: bookingReference(booking.id),
      period: `Du ${day(booking.startDate)} au ${day(booking.endDate)}`,
      duration: `${booking.duration} ${labels.unit[booking.duration > 1 ? 1 : 0]}`,
      rentalType: labels.type,
      deposit: Math.round(Number(booking.depositAmount.toString())),
    },
    property: { ...booking.property },
  };
}

/**
 * Brouillon prérempli depuis une réservation : client, ligne de location (durée × prix unitaire
 * quand la division tombe juste, sinon un forfait) et caution si elle existe. Tout reste
 * modifiable avant l'émission.
 */
export function draftFromBooking(booking: InvoiceableBooking) {
  const { booking: details } = bookingDetails(booking);
  const total = Math.round(Number(booking.totalAmount.toString()));
  const perUnit = total / booking.duration;
  const lines: InvoiceLine[] = [
    Number.isInteger(perUnit) && booking.duration > 1
      ? {
          description: `${details.rentalType} - ${booking.property.title}`,
          period: details.period,
          quantity: booking.duration,
          unitPrice: perUnit,
        }
      : {
          description: `${details.rentalType} - ${booking.property.title} (${details.duration})`,
          period: details.period,
          quantity: 1,
          unitPrice: total,
        },
  ];
  if (details.deposit > 0) {
    lines.push({
      description: 'Caution (remboursable)',
      period: null,
      quantity: 1,
      unitPrice: details.deposit,
    });
  }
  return {
    client: {
      name: booking.client?.user.name ?? '',
      email: booking.client?.user.email ?? null,
      phone: booking.client?.phone ?? null,
      address: null,
    },
    lines,
  };
}

/** Informations de l'agence copiées à l'émission (les images restent des URL). */
export type SnapshotAgency = Omit<InvoiceRenderData['agency'], 'logo' | 'stamp'> & {
  logoUrl: string | null;
  stampUrl: string | null;
};

/**
 * Tout ce qui est figé à l'émission, en plus des colonnes de la facture (client, lignes, dates,
 * numéro) qui ne changent plus une fois émise.
 */
export interface InvoiceSnapshot {
  version: 1;
  templateName: string;
  config: InvoiceTemplateConfig;
  vatRate: number;
  agency: SnapshotAgency;
  booking: InvoiceRenderData['booking'];
  property: InvoiceRenderData['property'];
}

/** Colonnes d'une facture utiles au rendu. */
export interface InvoiceRow {
  number: string | null;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  lines: unknown;
  dueAt: Date;
  issuedAt: Date | null;
  createdAt: Date;
}

/** Données de rendu d'une facture : figées (émise) ou courantes (brouillon). */
export function renderDataOf(
  invoice: InvoiceRow,
  frozen: Omit<InvoiceSnapshot, 'version' | 'templateName' | 'config'>,
  images: { logo: Buffer | null; stamp: Buffer | null },
): InvoiceRenderData {
  const { logoUrl: _logo, stampUrl: _stamp, ...agency } = frozen.agency;
  const watermark: InvoiceWatermark | null =
    invoice.status === 'DRAFT' ? 'BROUILLON' : invoice.status === 'CANCELLED' ? 'ANNULÉE' : null;
  return {
    number: invoice.number ?? '(brouillon)',
    issuedAt: invoice.issuedAt ?? invoice.createdAt,
    dueAt: invoice.dueAt,
    watermark,
    vatRate: frozen.vatRate,
    agency: { ...agency, ...images },
    client: {
      name: invoice.clientName,
      email: invoice.clientEmail,
      phone: invoice.clientPhone,
      address: invoice.clientAddress,
    },
    booking: frozen.booking,
    property: frozen.property,
    lines: invoice.lines as InvoiceLine[],
  };
}

/** Champs de l'agence lus pour émettre une facture (ou en rendre l'aperçu). */
export const ISSUER_SELECT = {
  name: true,
  companyName: true,
  ninea: true,
  rccm: true,
  address: true,
  billingAddress: true,
  phone: true,
  email: true,
  billingEmail: true,
  bankName: true,
  bankAccount: true,
  mobileMoneyNumber: true,
  agencyLogo: true,
  invoiceStampUrl: true,
  vatRate: true,
  invoicePrefix: true,
  defaultInvoiceTemplateId: true,
} as const;

/** Émetteur tel qu'imprimé : adresse et e-mail de facturation s'ils existent. */
export function issuerOf(agency: {
  name: string;
  companyName: string | null;
  ninea: string | null;
  rccm: string | null;
  address: string;
  billingAddress: string | null;
  phone: string | null;
  email: string;
  billingEmail: string | null;
  bankName: string | null;
  bankAccount: string | null;
  mobileMoneyNumber: string | null;
  agencyLogo: string | null;
  invoiceStampUrl: string | null;
  vatRate: { toString(): string };
}): { agency: SnapshotAgency; vatRate: number } {
  return {
    agency: {
      name: agency.name,
      companyName: agency.companyName,
      ninea: agency.ninea,
      rccm: agency.rccm,
      address: agency.billingAddress ?? agency.address,
      phone: agency.phone,
      email: agency.billingEmail ?? agency.email,
      bankName: agency.bankName,
      bankAccount: agency.bankAccount,
      mobileMoneyNumber: agency.mobileMoneyNumber,
      logoUrl: agency.agencyLogo,
      stampUrl: agency.invoiceStampUrl,
    },
    vatRate: Number(agency.vatRate.toString()),
  };
}
