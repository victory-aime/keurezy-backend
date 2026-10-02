import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { HttpError } from '../../config/http.error';
import { CLOUDINARY_FOLDER_NAME, FeatureCommercial } from '../../config/enum';
import { AgencyService } from '../agency/agency.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UploadsService } from '../cloudinary/uploads.service';
import { PlanFeaturePolicyService } from '../packs/plan-feature-policy.service';
import { loadInvoiceImages } from './agency-image';
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
import { ISSUER_SELECT, issuerOf } from './invoice-data';
import { INVOICE_VARIABLES, unknownVariables } from './invoice-variables';
import { sampleInvoice } from './sample-invoice';

/** Modèle tel que le web le reçoit. */
export interface InvoiceTemplateView {
  id: string;
  name: string;
  /** Modèle commun : non modifiable en place (le modifier crée une copie) */
  isDefault: boolean;
  /** Présentation d'un modèle commun ; null pour un modèle de l'agence */
  description: string | null;
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
    private readonly uploads: UploadsService,
    private readonly cloudinary: CloudinaryService,
    private readonly policy: PlanFeaturePolicyService,
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
        select: {
          vatRate: true,
          invoicePrefix: true,
          defaultInvoiceTemplateId: true,
          invoiceStampUrl: true,
        },
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
        stampUrl: agency.invoiceStampUrl,
      },
    };
  }

  async create(agencyId: string, userId: string, data: CreateInvoiceTemplateDto) {
    await this.assertOwner(agencyId, userId);
    assertKnownVariables(data.config);
    await this.assertTemplateRoom(agencyId);
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
      await this.assertTemplateRoom(agencyId);
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
    await this.assertTemplateEditable(agencyId);
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
    const issuer = issuerOf(
      await this.prisma.agency.findUniqueOrThrow({
        where: { id: agencyId },
        select: ISSUER_SELECT,
      }),
    );
    const images = await loadInvoiceImages(config, issuer.agency);
    const { logoUrl: _logo, stampUrl: _stamp, ...agency } = issuer.agency;
    return renderInvoicePdf(config, sampleInvoice({ ...agency, ...images }, issuer.vatRate));
  }

  /**
   * Cachet ou signature scanné de l'agence (owner). PNG ou JPEG, contenu vérifié par sa
   * signature binaire (le type annoncé par le navigateur ne prouve rien). Remplace le précédent.
   */
  async uploadStamp(agencyId: string, userId: string, file: Express.Multer.File | undefined) {
    await this.assertOwner(agencyId, userId);
    if (!file || !isPngOrJpeg(file.buffer)) {
      throw new HttpError(
        'Image PNG ou JPEG attendue',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_STAMP_IMAGE',
      );
    }
    const agency = await this.prisma.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { name: true, invoiceStampUrl: true },
    });
    const uploaded = await this.uploads.uploadFiles(
      file,
      agency.name,
      CLOUDINARY_FOLDER_NAME.INVOICING,
    );
    await this.prisma.agency.update({
      where: { id: agencyId },
      data: { invoiceStampUrl: uploaded.secure_url },
    });
    await this.deleteFromCloudinary(agency.invoiceStampUrl);
    return { stampUrl: uploaded.secure_url as string };
  }

  /** Retire le cachet : les modèles qui l'utilisaient impriment un cadre vide. */
  async removeStamp(agencyId: string, userId: string) {
    await this.assertOwner(agencyId, userId);
    const { invoiceStampUrl } = await this.prisma.agency.findUniqueOrThrow({
      where: { id: agencyId },
      select: { invoiceStampUrl: true },
    });
    await this.prisma.agency.update({
      where: { id: agencyId },
      data: { invoiceStampUrl: null },
    });
    await this.deleteFromCloudinary(invoiceStampUrl);
    return { stampUrl: null };
  }

  /** Place pour un modèle de plus (création ou personnalisation d'un modèle commun). */
  private async assertTemplateRoom(agencyId: string) {
    if (!(await this.policy.hasRoomFor(agencyId, FeatureCommercial.INVOICE_TEMPLATES))) {
      throw templateCapacity('Limite de modèles personnalisés atteinte pour votre plan');
    }
  }

  /**
   * Après un downgrade, les modèles en trop restent utilisables mais ne se modifient plus
   * (supprimer un modèle en trop rend la main sur les autres).
   */
  private async assertTemplateEditable(agencyId: string) {
    const context = await this.policy.getAgencyFeatureContext(agencyId);
    const used = await this.policy.countInvoiceTemplates(agencyId);
    const check = this.policy.checkCapacity(context, FeatureCommercial.INVOICE_TEMPLATES, used);
    if (!check.enabled || (check.capacity !== null && used > check.capacity)) {
      throw templateCapacity(
        'Votre plan compte moins de modèles que vous n’en avez : supprimez-en pour modifier les autres',
      );
    }
  }

  /**
   * Retire une ancienne image de Cloudinary. Sans risque pour les factures émises : leurs images
   * sont copiées en base à l'émission. Un échec est journalisé, jamais bloquant.
   */
  private async deleteFromCloudinary(url: string | null) {
    const publicId = cloudinaryPublicId(url);
    if (!publicId) return;
    try {
      await this.cloudinary.deleteImage(publicId);
    } catch (error) {
      this.logger.warn(`Ancien cachet non supprimé de Cloudinary (${publicId}) : ${String(error)}`);
    }
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
    description:
      DEFAULT_INVOICE_TEMPLATES.find((t) => t.key === template.defaultKey)?.description ?? null,
    config: template.config as InvoiceTemplateConfig,
    updatedAt: template.updatedAt,
  };
}

const templateCapacity = (message: string) =>
  new HttpError(message, HttpStatus.FORBIDDEN, 'INVOICE_TEMPLATE_CAPACITY_REACHED');

/**
 * Identifiant Cloudinary d'une image à partir de son URL de livraison :
 * `https://res.cloudinary.com/<cloud>/image/upload/v123/<dossier>/<nom>.png` → `<dossier>/<nom>`.
 */
export function cloudinaryPublicId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match =
    /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i.exec(
      url,
    );
  return match ? decodeURIComponent(match[1]) : null;
}

/** Signature binaire PNG ou JPEG : les seuls formats que pdfkit sait imprimer. */
export function isPngOrJpeg(buffer: Buffer | undefined): boolean {
  if (!buffer || buffer.length < 4) return false;
  const png = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return png || jpeg;
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
