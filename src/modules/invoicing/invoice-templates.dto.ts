import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoiceTemplateConfigDto } from './invoice-template.config';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateInvoiceTemplateDto {
  @ApiProperty({ example: 'Facture loyer' })
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name: string;

  @ApiProperty({ type: InvoiceTemplateConfigDto })
  @ValidateNested()
  @Type(() => InvoiceTemplateConfigDto)
  config: InvoiceTemplateConfigDto;
}

export class UpdateInvoiceTemplateDto {
  @ApiPropertyOptional({ example: 'Facture loyer' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name?: string;

  @ApiProperty({ type: InvoiceTemplateConfigDto })
  @ValidateNested()
  @Type(() => InvoiceTemplateConfigDto)
  config: InvoiceTemplateConfigDto;
}

export class PreviewInvoiceTemplateDto {
  @ApiProperty({ type: InvoiceTemplateConfigDto })
  @ValidateNested()
  @Type(() => InvoiceTemplateConfigDto)
  config: InvoiceTemplateConfigDto;
}

/** Réglages de facturation de l'agence (owner). */
export class InvoiceSettingsDto {
  @ApiPropertyOptional({ example: 18, description: 'Taux de TVA en % (0 : non soumis)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @ApiPropertyOptional({
    example: 'FAC',
    description: 'Préfixe des numéros (1 à 8 lettres ou chiffres)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9]{1,8}$/, { message: 'Préfixe : 1 à 8 lettres ou chiffres' })
  invoicePrefix?: string;

  @ApiPropertyOptional({ description: 'Modèle proposé à la création des factures' })
  @IsOptional()
  @IsUUID()
  defaultTemplateId?: string;
}
