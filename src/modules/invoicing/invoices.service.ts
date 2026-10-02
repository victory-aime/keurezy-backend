import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import { BookingStatus, InvoiceStatus } from '../../../prisma/generated/enums';
import { HttpError } from '../../config/http.error';
import { PrismaService } from '../../database/prisma.service';
import { AgencyService } from '../agency/agency.service';
import { FeatureCommercial } from '../../config/enum';
import { PlanFeaturePolicyService } from '../packs/plan-feature-policy.service';
import { invoiceAsset, loadInvoiceImages } from './agency-image';
import {
  bookingDetails,
  bookingReference,
  draftFromBooking,
  ISSUER_SELECT,
  issuerOf,
  renderDataOf,
  type InvoiceSnapshot,
} from './invoice-data';
import { invoiceTotals, renderInvoicePdf, type InvoiceLine } from './invoice-pdf';
import { InvoiceLayout, type InvoiceTemplateConfig } from './invoice-template.config';
import type {
  CancelInvoiceDto,
  CreateInvoiceDto,
  InvoiceDraftDto,
  ListInvoicesDto,
  PayInvoiceDto,
} from './invoices.dto';

/** Échéance proposée : 15 jours après la création. */
const DEFAULT_DUE_DAYS = 15;
/** Total d'une facture plafonné (francs CFA) : reste loin des limites des colonnes entières. */
const MAX_TOTAL = 1_000_000_000;
const INVOICEABLE_BOOKINGS = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED];

const BOOKING_SELECT = {
  id: true,
  rentalType: true,
  startDate: true,
  endDate: true,
  duration: true,
  totalAmount: true,
  depositAmount: true,
  property: { select: { title: true, address: true, city: true } },
  client: { select: { phone: true, user: { select: { name: true, email: true } } } },
} as const;

type Tx = Prisma.TransactionClient;
type InvoiceRecord = NonNullable<Awaited<ReturnType<PrismaService['invoice']['findFirst']>>>;

const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Attribue le numéro suivant de l'agence pour l'année : incrément atomique du compteur
 * (une ligne par agence et par année), dans la transaction d'émission. Deux émissions
 * simultanées reçoivent deux rangs distincts ; une émission annulée rend son rang.
 */
export async function nextInvoiceNumber(tx: Tx, agencyId: string, prefix: string, year: number) {
  const [{ last }] = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "invoice_counter" ("agencyId", "year", "last") VALUES (${agencyId}, ${year}, 1)
    ON CONFLICT ("agencyId", "year") DO UPDATE SET "last" = "invoice_counter"."last" + 1
    RETURNING "last"`;
  return formatInvoiceNumber(prefix, year, last);
}

export const formatInvoiceNumber = (prefix: string, year: number, rank: number) =>
  `${prefix}-${year}-${String(rank).padStart(4, '0')}`;

/**
 * Factures de l'agence à ses clients : brouillon (libre ou depuis une réservation), émission
 * figée et numérotée, payée, annulée, PDF. Accès : owner, et staff avec `manage_invoices`
 * (garde du contrôleur) ; toutes les requêtes sont limitées à l'agence de l'appelant.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
    private readonly policy: PlanFeaturePolicyService,
  ) {}

  async list(agencyId: string, userId: string, query: ListInvoicesDto) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const currentPage = query.page ?? 1;
    const take = query.pageSize ?? 20;
    const where: Prisma.InvoiceWhereInput = {
      agencyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: 'insensitive' } },
              { clientName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (currentPage - 1) * take,
        take,
        select: {
          id: true,
          number: true,
          status: true,
          clientName: true,
          totalTtc: true,
          dueAt: true,
          issuedAt: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.groupBy({ by: ['status'], where: { agencyId }, _count: true }),
    ]);
    return {
      content: rows,
      totalDataPerPage: take,
      totalItems: total,
      currentPage,
      totalPages: Math.ceil(total / take),
      /** Nombre de factures par statut (onglets) */
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    };
  }

  async get(agencyId: string, userId: string, id: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    return this.toView(await this.find(agencyId, id));
  }

  /** Réservations confirmées ou terminées, à facturer (les plus récentes d'abord). */
  async invoiceableBookings(agencyId: string, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const bookings = await this.prisma.booking.findMany({
      where: { agencyId, status: { in: INVOICEABLE_BOOKINGS } },
      orderBy: { startDate: 'desc' },
      take: 100,
      select: { ...BOOKING_SELECT, status: true, _count: { select: { invoices: true } } },
    });
    return bookings.map((b) => ({
      id: b.id,
      reference: bookingReference(b.id),
      status: b.status,
      clientName: b.client?.user.name ?? null,
      propertyTitle: b.property.title,
      startDate: b.startDate,
      endDate: b.endDate,
      totalAmount: Math.round(Number(b.totalAmount.toString())),
      invoiceCount: b._count.invoices,
    }));
  }

  /** Nouveau brouillon : prérempli depuis une réservation, ou facture libre. */
  async create(agencyId: string, userId: string, data: CreateInvoiceDto) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const agency = await this.prisma.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { vatRate: true },
    });
    const vatRate = Number(agency.vatRate.toString());

    let content: { client: InvoiceDraftDto['client']; lines: InvoiceLine[]; dueAt: Date };
    let templateId = data.draft?.templateId;
    if (data.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: data.bookingId, agencyId, status: { in: INVOICEABLE_BOOKINGS } },
        select: BOOKING_SELECT,
      });
      if (!booking) {
        throw new HttpError(
          'Réservation introuvable ou pas encore confirmée',
          HttpStatus.NOT_FOUND,
          'BOOKING_NOT_INVOICEABLE',
        );
      }
      const draft = draftFromBooking(booking);
      content = {
        client: { ...draft.client, name: draft.client.name || 'Client' },
        lines: draft.lines,
        dueAt: new Date(startOfUtcDay(new Date()).getTime() + DEFAULT_DUE_DAYS * 86_400_000),
      };
      templateId = undefined;
    } else if (data.draft) {
      content = { ...data.draft, dueAt: new Date(data.draft.dueAt) };
    } else {
      throw new HttpError(
        'Choisissez une réservation ou saisissez la facture',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'DRAFT_REQUIRED',
      );
    }
    if (templateId) await this.assertUsableTemplate(agencyId, templateId);

    const created = await this.prisma.invoice.create({
      data: {
        agencyId,
        bookingId: data.bookingId ?? null,
        templateId: templateId ?? null,
        createdBy: userId,
        ...draftColumns(content, vatRate),
      },
    });
    return this.toView(created);
  }

  /** Modifie un brouillon ; une facture émise ne se modifie plus (`409`). */
  async update(agencyId: string, userId: string, id: string, data: InvoiceDraftDto) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    await this.find(agencyId, id);
    if (data.templateId) await this.assertUsableTemplate(agencyId, data.templateId);
    const agency = await this.prisma.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { vatRate: true },
    });
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, agencyId, status: InvoiceStatus.DRAFT },
      data: {
        templateId: data.templateId ?? null,
        ...draftColumns(
          { ...data, dueAt: new Date(data.dueAt) },
          Number(agency.vatRate.toString()),
        ),
      },
    });
    if (!count) throw notDraft();
    return this.get(agencyId, userId, id);
  }

  /** Supprime un brouillon (une facture émise s'annule, elle ne se supprime pas). */
  async remove(agencyId: string, userId: string, id: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    await this.find(agencyId, id);
    const { count } = await this.prisma.invoice.deleteMany({
      where: { id, agencyId, status: InvoiceStatus.DRAFT },
    });
    if (!count) throw notDraft();
    return { deleted: true };
  }

  /**
   * Émet un brouillon : numéro suivant de l'agence, et copie figée de tout ce que le PDF
   * imprime (agence, modèle, TVA, réservation, bien). Totaux recalculés au taux du jour.
   * Tout se fait dans une transaction : en cas d'échec, ni numéro consommé ni facture émise.
   */
  async issue(agencyId: string, userId: string, id: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const invoice = await this.find(agencyId, id);
    if (invoice.status !== InvoiceStatus.DRAFT) throw notDraft();

    // Hors transaction : lectures et téléchargement des images (le verrou du compteur reste court)
    const context = await this.policy.getAgencyFeatureContext(agencyId);
    const { snapshot, prefix } = await this.assemble(this.prisma, agencyId, invoice);
    const images = await loadInvoiceImages(snapshot.config, snapshot.agency);
    const logo = invoiceAsset(images.logo);
    const stamp = invoiceAsset(images.stamp);
    const frozen: InvoiceSnapshot = {
      ...snapshot,
      version: 2,
      agency: { ...snapshot.agency, logoAsset: logo?.id ?? null, stampAsset: stamp?.id ?? null },
    };

    await this.prisma.$transaction(async (tx) => {
      const issuedAt = new Date();
      // Le compteur verrouille la ligne de l'agence : les émissions simultanées passent une à une,
      // le quota ci-dessous ne peut donc pas être dépassé en concurrence
      const number = await nextInvoiceNumber(tx, agencyId, prefix, issuedAt.getUTCFullYear());
      const used = await this.policy.countInvoicesThisMonth(agencyId, issuedAt, tx);
      if (!this.policy.checkCapacity(context, FeatureCommercial.INVOICES, used).allowed) {
        throw new HttpError(
          'Limite de factures émises ce mois-ci atteinte pour votre plan',
          HttpStatus.FORBIDDEN,
          'INVOICE_CAPACITY_REACHED',
        );
      }
      for (const asset of [logo, stamp]) {
        if (asset) {
          await tx.invoiceAsset.upsert({ where: { id: asset.id }, create: asset, update: {} });
        }
      }
      const totals = invoiceTotals(invoice.lines as unknown as InvoiceLine[], frozen.vatRate);
      const { count } = await tx.invoice.updateMany({
        where: { id, agencyId, status: InvoiceStatus.DRAFT },
        data: {
          status: InvoiceStatus.ISSUED,
          number,
          issuedAt,
          snapshot: frozen as unknown as Prisma.InputJsonValue,
          totalHt: totals.ht,
          totalVat: totals.vat,
          totalTtc: totals.ttc,
        },
      });
      // Émise entre-temps par une autre requête : rien n'est consommé
      if (!count) throw notDraft();
    });
    return this.get(agencyId, userId, id);
  }

  /** Enregistre le paiement d'une facture émise (date et moyen saisis par l'agence). */
  async pay(agencyId: string, userId: string, id: string, data: PayInvoiceDto) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const invoice = await this.find(agencyId, id);
    const paidAt = new Date(data.paidAt);
    if (paidAt > new Date()) {
      throw new HttpError(
        'La date de paiement ne peut pas être dans le futur',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PAID_IN_FUTURE',
      );
    }
    if (invoice.issuedAt && paidAt < startOfUtcDay(invoice.issuedAt)) {
      throw new HttpError(
        'La date de paiement précède l’émission',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PAID_BEFORE_ISSUE',
      );
    }
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, agencyId, status: InvoiceStatus.ISSUED },
      data: { status: InvoiceStatus.PAID, paidAt, paymentMethod: data.method },
    });
    if (!count) throw wrongStatus('Seule une facture émise et non payée peut être marquée payée');
    return this.get(agencyId, userId, id);
  }

  /** Annule une facture émise ou payée : numéro conservé, motif obligatoire, mention ANNULÉE. */
  async cancel(agencyId: string, userId: string, id: string, data: CancelInvoiceDto) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    await this.find(agencyId, id);
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, agencyId, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] } },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: data.reason,
      },
    });
    if (!count) {
      throw wrongStatus('Un brouillon se supprime ; une facture annulée le reste');
    }
    return this.get(agencyId, userId, id);
  }

  /**
   * PDF d'une facture. Émise : rendue depuis la copie figée uniquement (le modèle ou l'agence
   * peuvent avoir changé depuis). Brouillon : données du jour et mention BROUILLON.
   */
  async pdf(agencyId: string, userId: string, id: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const invoice = await this.find(agencyId, id);
    const snapshot =
      invoice.status === InvoiceStatus.DRAFT
        ? (await this.assemble(this.prisma, agencyId, invoice)).snapshot
        : (invoice.snapshot as unknown as InvoiceSnapshot);
    const images =
      snapshot.version === 2
        ? await this.frozenImages(snapshot)
        : await loadInvoiceImages(snapshot.config, snapshot.agency);
    const pdf = await renderInvoicePdf(snapshot.config, renderDataOf(invoice, snapshot, images));
    return { filename: `${invoice.number ?? 'brouillon'}.pdf`, pdf };
  }

  /** Images copiées à l'émission : aucune lecture de Cloudinary pour une facture émise. */
  private async frozenImages(snapshot: InvoiceSnapshot) {
    const ids = [snapshot.agency.logoAsset, snapshot.agency.stampAsset].filter(
      (assetId): assetId is string => !!assetId,
    );
    const assets = ids.length
      ? await this.prisma.invoiceAsset.findMany({ where: { id: { in: ids } } })
      : [];
    const byId = new Map(assets.map((asset) => [asset.id, Buffer.from(asset.data)]));
    return {
      logo: byId.get(snapshot.agency.logoAsset ?? '') ?? null,
      stamp: byId.get(snapshot.agency.stampAsset ?? '') ?? null,
    };
  }

  /** Facture de l'agence ; celle d'une autre agence est introuvable (`404`). */
  private async find(agencyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, agencyId } });
    if (!invoice) {
      throw new HttpError('Facture introuvable', HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND');
    }
    return invoice;
  }

  private async assertUsableTemplate(agencyId: string, templateId: string) {
    const template = await this.prisma.invoiceTemplate.findFirst({
      where: { id: templateId, OR: [{ agencyId: null }, { agencyId }] },
      select: { id: true },
    });
    if (!template) {
      throw new HttpError('Modèle introuvable', HttpStatus.NOT_FOUND, 'TEMPLATE_NOT_FOUND');
    }
  }

  /**
   * Tout ce que le PDF imprime, lu maintenant : agence, modèle (celui du brouillon, sinon le
   * modèle par défaut de l'agence, sinon Classique), taux de TVA, réservation et bien.
   */
  private async assemble(db: Tx | PrismaService, agencyId: string, invoice: InvoiceRecord) {
    const agency = await db.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: ISSUER_SELECT,
    });
    const usable = { OR: [{ agencyId: null }, { agencyId }] };
    const template =
      (await db.invoiceTemplate.findFirst({
        where: { id: invoice.templateId ?? agency.defaultInvoiceTemplateId ?? '', ...usable },
        select: { name: true, config: true },
      })) ??
      (await db.invoiceTemplate.findFirstOrThrow({
        where: { defaultKey: InvoiceLayout.CLASSIC },
        select: { name: true, config: true },
      }));
    const booking = invoice.bookingId
      ? await db.booking.findFirst({
          where: { id: invoice.bookingId, agencyId },
          select: BOOKING_SELECT,
        })
      : null;
    const details = booking ? bookingDetails(booking) : { booking: null, property: null };
    const issuer = issuerOf(agency);
    const snapshot: InvoiceSnapshot = {
      version: 1,
      templateName: template.name,
      config: template.config as unknown as InvoiceTemplateConfig,
      vatRate: issuer.vatRate,
      agency: issuer.agency,
      booking: details.booking,
      property: details.property,
    };
    return { snapshot, prefix: agency.invoicePrefix };
  }

  private toView(invoice: InvoiceRecord) {
    const snapshot = invoice.snapshot as unknown as InvoiceSnapshot | null;
    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      bookingId: invoice.bookingId,
      bookingReference: invoice.bookingId ? bookingReference(invoice.bookingId) : null,
      templateId: invoice.templateId,
      templateName: snapshot?.templateName ?? null,
      client: {
        name: invoice.clientName,
        email: invoice.clientEmail,
        phone: invoice.clientPhone,
        address: invoice.clientAddress,
      },
      lines: invoice.lines as unknown as InvoiceLine[],
      totals: { ht: invoice.totalHt, vat: invoice.totalVat, ttc: invoice.totalTtc },
      vatRate: snapshot?.vatRate ?? null,
      dueAt: invoice.dueAt,
      issuedAt: invoice.issuedAt,
      paidAt: invoice.paidAt,
      paymentMethod: invoice.paymentMethod,
      cancelledAt: invoice.cancelledAt,
      cancelReason: invoice.cancelReason,
      createdAt: invoice.createdAt,
    };
  }
}

/** Colonnes d'un brouillon, totaux compris (refus au-delà du plafond). */
function draftColumns(
  content: { client: InvoiceDraftDto['client']; lines: InvoiceLine[]; dueAt: Date },
  vatRate: number,
) {
  const lines = content.lines.map((l) => ({
    description: l.description,
    period: l.period ?? null,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
  const totals = invoiceTotals(lines, vatRate);
  if (totals.ttc > MAX_TOTAL) {
    throw new HttpError(
      'Montant total trop élevé',
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INVOICE_TOTAL_TOO_LARGE',
    );
  }
  return {
    clientName: content.client.name,
    clientEmail: content.client.email ?? null,
    clientPhone: content.client.phone ?? null,
    clientAddress: content.client.address ?? null,
    lines,
    totalHt: totals.ht,
    totalVat: totals.vat,
    totalTtc: totals.ttc,
    dueAt: content.dueAt,
  };
}

const notDraft = () =>
  new HttpError(
    'Facture déjà émise : elle ne se modifie plus (annulez-la puis émettez-en une autre)',
    HttpStatus.CONFLICT,
    'INVOICE_NOT_DRAFT',
  );

const wrongStatus = (message: string) =>
  new HttpError(message, HttpStatus.CONFLICT, 'INVOICE_WRONG_STATUS');
