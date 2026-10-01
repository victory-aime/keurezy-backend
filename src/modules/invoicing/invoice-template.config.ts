import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export enum InvoiceLayout {
  CLASSIC = 'CLASSIC',
  MODERN = 'MODERN',
  MINIMAL = 'MINIMAL',
}

export enum InvoiceFont {
  HELVETICA = 'HELVETICA',
  TIMES = 'TIMES',
  COURIER = 'COURIER',
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Colonnes facultatives du tableau (la désignation et le total sont toujours affichés). */
export class InvoiceColumnsDto {
  @IsBoolean() period: boolean;
  @IsBoolean() quantity: boolean;
  @IsBoolean() unitPrice: boolean;
  @IsBoolean() vat: boolean;
}

export class InvoiceBlocksDto {
  /** Raison sociale, NINEA, RCCM de l'agence */
  @IsBoolean() legal: boolean;
  /** Banque, RIB, Wave ou Orange Money */
  @IsBoolean() bank: boolean;
  /** Zone « Signature et cachet » */
  @IsBoolean() signature: boolean;
}

/** Textes libres : texte brut et variables `{{groupe.cle}}` du catalogue, rien d'autre. */
export class InvoiceTextsDto {
  @IsString() @MaxLength(60) title: string;
  @IsString() @MaxLength(500) intro: string;
  @IsString() @MaxLength(500) paymentTerms: string;
  @IsString() @MaxLength(1000) notes: string;
  @IsString() @MaxLength(300) footer: string;
}

/** Configuration structurée d'un modèle de facture (aucun HTML : rendu par pdfkit). */
export class InvoiceTemplateConfigDto {
  @ApiProperty({ enum: InvoiceLayout })
  @IsEnum(InvoiceLayout)
  layout: InvoiceLayout;

  @ApiProperty({ example: '#673ab6' })
  @Matches(HEX, { message: 'Couleur au format #RRGGBB' })
  primaryColor: string;

  @ApiProperty({ example: '#f59e0b' })
  @Matches(HEX, { message: 'Couleur au format #RRGGBB' })
  accentColor: string;

  @ApiProperty({ enum: InvoiceFont })
  @IsEnum(InvoiceFont)
  font: InvoiceFont;

  @ApiProperty()
  @IsBoolean()
  showLogo: boolean;

  @ApiProperty({ type: InvoiceColumnsDto })
  @ValidateNested()
  @Type(() => InvoiceColumnsDto)
  columns: InvoiceColumnsDto;

  @ApiProperty({ type: InvoiceBlocksDto })
  @ValidateNested()
  @Type(() => InvoiceBlocksDto)
  blocks: InvoiceBlocksDto;

  @ApiProperty({ type: InvoiceTextsDto })
  @ValidateNested()
  @Type(() => InvoiceTextsDto)
  texts: InvoiceTextsDto;
}

export type InvoiceTemplateConfig = InvoiceTemplateConfigDto;

const legalFooter = '{{agence.raison_sociale}} - NINEA {{agence.ninea}} - RCCM {{agence.rccm}}';

/** Les 3 modèles par défaut, communs à toutes les agences (source unique, créés au démarrage). */
export const DEFAULT_INVOICE_TEMPLATES: {
  key: InvoiceLayout;
  name: string;
  config: InvoiceTemplateConfig;
}[] = [
  {
    key: InvoiceLayout.CLASSIC,
    name: 'Classique',
    config: {
      layout: InvoiceLayout.CLASSIC,
      primaryColor: '#1f2937',
      accentColor: '#673ab6',
      font: InvoiceFont.HELVETICA,
      showLogo: true,
      columns: { period: true, quantity: true, unitPrice: true, vat: true },
      blocks: { legal: true, bank: true, signature: false },
      texts: {
        title: 'Facture',
        intro: '',
        paymentTerms: 'Paiement à réception, au plus tard le {{facture.echeance}}.',
        notes: '',
        footer: legalFooter,
      },
    },
  },
  {
    key: InvoiceLayout.MODERN,
    name: 'Moderne',
    config: {
      layout: InvoiceLayout.MODERN,
      primaryColor: '#673ab6',
      accentColor: '#f59e0b',
      font: InvoiceFont.HELVETICA,
      showLogo: true,
      columns: { period: true, quantity: false, unitPrice: false, vat: true },
      blocks: { legal: true, bank: true, signature: true },
      texts: {
        title: 'FACTURE',
        intro: 'Merci pour votre confiance, {{client.nom}}.',
        paymentTerms: 'À régler avant le {{facture.echeance}}.',
        notes: '',
        footer: legalFooter,
      },
    },
  },
  {
    key: InvoiceLayout.MINIMAL,
    name: 'Minimal',
    config: {
      layout: InvoiceLayout.MINIMAL,
      primaryColor: '#111827',
      accentColor: '#6b7280',
      font: InvoiceFont.TIMES,
      showLogo: false,
      columns: { period: true, quantity: false, unitPrice: false, vat: false },
      blocks: { legal: true, bank: false, signature: false },
      texts: {
        title: 'Facture',
        intro: '',
        paymentTerms: 'Échéance : {{facture.echeance}}.',
        notes: '',
        footer: legalFooter,
      },
    },
  },
];

/** Tous les textes d'un modèle, pour contrôler leurs variables. */
export const templateTexts = (config: InvoiceTemplateConfig) => Object.values(config.texts);
