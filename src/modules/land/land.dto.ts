import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { LandPaymentType, LandStatus } from '../../../prisma/generated/enums';
import { PaginationDto } from '../../config/pagination.dto';

export class LandDto {
  @ApiProperty({ example: 'Terrain Almadies', description: 'Titre du terrain' })
  @IsString()
  title: string;

  @ApiProperty({ example: 15000000, description: "Prix d'achat du terrain (en FCFA)" })
  @Type(() => Number)
  @IsNumber()
  purchasePrice: number;

  @ApiProperty({ example: 500, description: 'Superficie du terrain en m²' })
  @Type(() => Number)
  @IsNumber()
  area: number;

  @ApiProperty({ example: 'Dakar', description: 'Ville où se situe le terrain' })
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: 'Almadies', description: 'Quartier ou district du terrain' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 'Route de Ngor', description: 'Adresse du terrain' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Mamadou Diallo', description: 'Propriétaire du terrain' })
  @IsOptional()
  @IsString()
  landOwner?: string | null;

  @ApiProperty({
    enum: LandStatus,
    example: LandStatus.AVAILABLE,
    description: 'Statut du terrain',
  })
  @IsEnum(LandStatus)
  status: LandStatus;

  @ApiProperty({
    enum: LandPaymentType,
    example: LandPaymentType.CASH,
    description: 'Type de paiement',
  })
  @IsEnum(LandPaymentType)
  paymentType: LandPaymentType;

  @ApiPropertyOptional({
    example: ['https://res.cloudinary.com/example/doc.pdf'],
    description: 'URLs des documents — injectées après upload',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documents?: string[];

  @ApiProperty({ example: 'uuid-de-l-agence', description: "Identifiant de l'agence" })
  @IsString()
  agencyId: string;
}

export class CreateLandDto extends LandDto {}

export class UpdateLandDto extends LandDto {
  @ApiProperty({
    example: 'uuid-du-terrain',
    description: 'Identifiant du terrain à mettre à jour',
  })
  @IsString()
  id: string;
}

export class LandResponseDto extends LandDto {
  @ApiProperty({ example: 'uuid-du-terrain', description: 'Identifiant du terrain' })
  id: string;

  @ApiProperty({ description: 'Liste des bâtiments sur ce terrain', type: [Object] })
  batiments: any[];
}

export class LandFilterDto extends PaginationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(LandStatus)
  status?: LandStatus;

  @IsOptional()
  @IsString()
  city?: string;
}
