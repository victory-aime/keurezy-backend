import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { AgencyService } from '../agency/agency.service';
import { loadAgencyLogo } from './agency-logo';
import { renderInvoicePdf } from './invoice-pdf';
import {
  DEFAULT_INVOICE_TEMPLATES,
  InvoiceLayout,
  templateTexts,
  type InvoiceTemplateConfig,
} from './invoice-template.config';
import type {
  CreateInvoiceTemplateDto,
  InvoiceSettingsDto,
  UpdateInvoiceTemplateDto,
} from './invoice-templates.dto';
import { INVOICE_VARIABLES, unknownVariables } from './invoice-variables';
import { sampleInvoice } from './sample-invoice';

/** Modèle tel que le web le reçoit. */
export interface InvoiceTemplateView {
  id: string;
  name: string;
  /** Modèle commun : non modifiable en place (le modifier crée une copie) */
  isDefault: boolean;
  config: InvoiceTemplateConfig;
  updatedAt: Date;
}

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  defaultKey: true,
  agencyId: true,
  config: true,
  updatedAt: true,
} as const;

/**
 * Modèles de facture : les 3 modèles communs et ceux de l'agence, ses réglages (TVA, préfixe,
 * modèle par défaut) et l'aperçu PDF. Lecture : owner et staff de l'agence ; écriture : owner.
 */
@Injectable()
export class InvoiceTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(InvoiceTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agencyService: AgencyService,
  ) {}

  /** Crée ou met à jour les modèles communs à partir de leur définition dans le code. */
  async onModuleInit() {
    try {
      for (const { key, name, config } of DEFAULT_INVOICE_TEMPLATES) {
        await this.prisma.invoiceTemplate.upsert({
          where: { defaultKey: key },
          create: { defaultKey: key, name, config: config as object },
          update: { name, config: config as object },
        });
      }
    } catch (error) {
      this.logger.error(`Modèles de facture par défaut non synchronisés : ${String(error)}`);
    }
  }

  /** Catalogue des variables insérables (source unique pour le web). */
  variables() {
    return INVOICE_VARIABLES;
  }

  async list(agencyId: string, userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    const [templates, agency] = await Promise.all([
      this.prisma.invoiceTemplate.findMany({
        where: { OR: [{ agencyId: null }, { agencyId }] },
        select: TEMPLATE_SELECT,
        orderBy: [{ agencyId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      }),
      this.prisma.agency.findUniqueOrThrow({
        where: { id: agencyId },
        select: { vatRate: true, invoicePrefix: true, defaultInvoiceTemplateId: true },
      }),
    ]);
    const views = templates.map(toView);
    const classic = templates.find((t) => t.defaultKey === InvoiceLayout.CLASSIC);
    const defaultTemplateId =
      views.find((t) => t.id === agency.defaultInvoiceTemplateId)?.id ?? classic?.id ?? null;
    return {
      templates: views,
      settings: {
        vatRate: Number(agency.vatRate.toString()),
        invoicePrefix: agency.invoicePrefix,
        defaultTemplateId,
      },
    };
  }

  async create(agencyId: string, userId: string, data: CreateInvoiceTemplateDto) {
    await this.assertOwner(agencyId, userId);
    assertKnownVariables(data.config);
    const created = await this.prisma.invoiceTemplate.create({
      data: { agencyId, name: data.name, config: data.config as object },
      select: TEMPLATE_SELECT,
    });
    return toView(created);
  }

  /**
   * Modifie un modèle de l'agence. Un modèle commun n'est jamais modifié en place : la
   * modification crée une copie propre à l'agence (renvoyée), l'original reste intact.
   */
  async update(agencyId: string, userId: string, id: string, data: UpdateInvoiceTemplateDto) {
    await this.assertOwner(agencyId, userId);
    assertKnownVariables(data.config);
    const template = await this.findUsable(agencyId, id);
    if (template.agencyId === null) {
      const copy = await this.prisma.invoiceTemplate.create({
        data: {
          agencyId,
          name: data.name ?? `${template.name} (personnalisé)`,
          config: data.config as object,
        },
        select: TEMPLATE_SELECT,
      });
      return toView(copy);
    }
    const updated = await this.prisma.invoiceTemplate.update({
      where: { id },
      data: { ...(data.name ? { name: data.name } : {}), config: data.config as object },
      select: TEMPLATE_SELECT,
    });
    return toView(updated);
  }

  /** Supprime un modèle de l'agence ; si c'était son modèle par défaut, retour à Classique. */
  async remove(agencyId: string, userId: string, id: string) {
    await this.assertOwner(agencyId, userId);
    const template = await this.findUsable(agencyId, id);
    if (template.agencyId === null) {
      throw new HttpError(
        'Un modèle commun ne peut pas être supprimé',
        HttpStatus.CONFLICT,
        'DEFAULT_TEMPLATE_LOCKED',
      );
    }
    await this.prisma.$transaction([
      this.prisma.invoiceTemplate.delete({ where: { id } }),
      this.prisma.agency.updateMany({
        where: { id: agencyId, defaultInvoiceTemplateId: id },
        data: { defaultInvoiceTemplateId: null },
      }),
    ]);
    return { deleted: true };
  }

  async updateSettings(agencyId: string, userId: string, data: InvoiceSettingsDto) {
    await this.assertOwner(agencyId, userId);
    if (data.defaultTemplateId) await this.findUsable(agencyId, data.defaultTemplateId);
    await this.prisma.agency.update({
      where: { id: agencyId },
      data: {
        ...(data.vatRate !== undefined ? { vatRate: data.vatRate } : {}),
        ...(data.invoicePrefix ? { invoicePrefix: data.invoicePrefix } : {}),
        ...(data.defaultTemplateId ? { defaultInvoiceTemplateId: data.defaultTemplateId } : {}),
      },
    });
    return (await this.list(agencyId, userId)).settings;
  }

  /**
   * Aperçu PDF d'une configuration (enregistrée ou non) : informations réelles de l'agence,
   * client et lignes d'exemple. Même moteur que les factures émises.
   */
  async preview(agencyId: string, userId: string, config: InvoiceTemplateConfig) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    assertKnownVariables(config);
    const agency = await this.prisma.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: {
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
        vatRate: true,
      },
    });
    const logo = config.showLogo ? await loadAgencyLogo(agency.agencyLogo) : null;
    return renderInvoicePdf(
      config,
      sampleInvoice(
        {
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
          logo,
        },
        Number(agency.vatRate.toString()),
      ),
    );
  }

  /** Modèle commun ou de l'agence ; un modèle d'une autre agence est introuvable. */
  private async findUsable(agencyId: string, id: string) {
    const template = await this.prisma.invoiceTemplate.findFirst({
      where: { id, OR: [{ agencyId: null }, { agencyId }] },
      select: TEMPLATE_SELECT,
    });
    if (!template) {
      throw new HttpError('Modèle introuvable', HttpStatus.NOT_FOUND, 'TEMPLATE_NOT_FOUND');
    }
    return template;
  }

  private async assertOwner(agencyId: string, userId: string) {
    const actor = await this.agencyService.agencyAccessControl(agencyId, userId);
    if (actor.type !== 'OWNER') {
      throw new HttpError(
        'Seul le propriétaire peut gérer les modèles de facture',
        HttpStatus.FORBIDDEN,
        'OWNER_ONLY',
      );
    }
  }
}

function toView(template: {
  id: string;
  name: string;
  defaultKey: string | null;
  config: unknown;
  updatedAt: Date;
}): InvoiceTemplateView {
  return {
    id: template.id,
    name: template.name,
    isDefault: template.defaultKey !== null,
    config: template.config as InvoiceTemplateConfig,
    updatedAt: template.updatedAt,
  };
}

/** Refuse un modèle dont un texte contient une variable hors du catalogue. */
function assertKnownVariables(config: InvoiceTemplateConfig) {
  const unknown = [...new Set(templateTexts(config).flatMap(unknownVariables))];
  if (unknown.length) {
    throw new HttpError(
      `Variables inconnues : ${unknown.join(', ')}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'UNKNOWN_VARIABLES',
    );
  }
}
