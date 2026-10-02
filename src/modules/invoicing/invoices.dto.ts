import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoicePaymentMethod, InvoiceStatus } from '../../../prisma/generated/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Champ facultatif : une chaîne vide vaut « non renseigné ». */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

/** Plafond d'un montant (francs CFA) : borne les totaux bien en deçà des entiers 32 bits. */
const MAX_AMOUNT = 1_000_000_000;

export class InvoiceLineDto {
  @ApiProperty({ example: 'Loyer - Appartement F3 Almadies' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  description: string;

  @ApiPropertyOptional({ example: 'Du 01/11/2026 au 30/11/2026' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(100)
  period?: string | null;

  @ApiProperty({ example: 1, description: 'Quantité (2 décimales au plus)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000)
  quantity: number;

  @ApiProperty({ example: 350000, description: 'Prix unitaire HT en francs CFA' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT)
  unitPrice: number;
}

export class InvoiceClientDto {
  @ApiProperty({ example: 'Aminata Diop' })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiPropertyOptional({ example: 'aminata.diop@exemple.sn' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ example: '+221 77 123 45 67' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Sicap Liberté 6, Dakar' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(300)
  address?: string | null;
}

/** Contenu modifiable d'un brouillon. */
export class InvoiceDraftDto {
  @ApiPropertyOptional({ description: 'Modèle (commun ou de l’agence)' })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiProperty({ type: InvoiceClientDto })
  @ValidateNested()
  @Type(() => InvoiceClientDto)
  client: InvoiceClientDto;

  @ApiProperty({ type: [InvoiceLineDto] })
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];

  @ApiProperty({ example: '2026-10-17', description: 'Échéance (date)' })
  @IsDateString({ strict: true })
  dueAt: string;
}

/** Nouveau brouillon : depuis une réservation (prérempli) ou libre (contenu complet). */
export class CreateInvoiceDto {
  @ApiPropertyOptional({ description: 'Réservation confirmée ou terminée de l’agence' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Contenu d’une facture libre (ignoré avec bookingId)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceDraftDto)
  draft?: InvoiceDraftDto;
}

export class PayInvoiceDto {
  @ApiProperty({ example: '2026-10-05' })
  @IsDateString({ strict: true })
  paidAt: string;

  @ApiProperty({ enum: InvoicePaymentMethod })
  @IsEnum(InvoicePaymentMethod)
  method: InvoicePaymentMethod;
}

export class CancelInvoiceDto {
  @ApiProperty({ example: 'Montant erroné, facture remplacée' })
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class ListInvoicesDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ description: 'Numéro ou nom du client' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
