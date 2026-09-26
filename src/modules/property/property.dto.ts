import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PropertyStatus, PropertyType, PropertyFeature } from '../../../prisma/generated/enums';
import { PaginationDto } from '../../config/pagination.dto';

export class PropertyDto {
  @ApiProperty({
    description: 'Identifiant unique de la propriété',
    example: 'ckx123abc',
  })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({
    description: 'Identifiant de l’agence à laquelle la propriété appartient',
    example: 'ckx456def',
  })
  @IsString()
  agencyId: string;

  @IsOptional()
  @IsString()
  batimentId?: string | null;

  @ApiProperty({
    description: 'Titre de la propriété',
    example: 'Appartement moderne avec vue sur la mer',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'URL des documents de la propriété',
    example: 'https://example.com/images/property-cover.jpg',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documents: string[];

  @ApiProperty({
    description: 'Type de la propriété',
    example: 'APARTMENT',
    enum: PropertyType,
  })
  @IsOptional()
  @IsEnum(PropertyType)
  type: PropertyType;

  @ApiProperty({
    description: 'Caractéristique de la propriété',
    example: 'KITCHEN',
    enum: PropertyFeature,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PropertyFeature, { each: true })
  features: PropertyFeature[];

  @ApiProperty({
    description: 'Nombre de salle de bain',
    example: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bathrooms: number;

  @ApiProperty({
    description: 'Nombre de salle de bain',
    example: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price: number;
  @ApiProperty({
    description: 'Nombre de salle de bain',
    example: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  caution: number;

  @ApiProperty({
    description: 'Surface de la propriété en mètres carrés',
    example: 120,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  area: number;

  @ApiProperty({
    description: 'Nombre de chambres de la propriété',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rooms: number;

  @ApiProperty({
    description: 'Nombre de chambres de la propriété',
    example: 'A3',
  })
  @IsOptional()
  @IsString()
  propertyNumber: string;

  @ApiProperty({
    description: 'Ville où se situe la propriété',
    example: 'Dakar',
  })
  @IsOptional()
  @IsString()
  city?: string | null;

  @ApiProperty({
    description: 'Adresse complète où se situe la propriété',
    example: 'Dakar',
  })
  @IsOptional()
  @IsString()
  address: string | null;

  @ApiProperty({
    description: 'Pays où se situe la propriété',
    example: 'Sénégal',
  })
  @IsOptional()
  @IsString()
  district?: string | null;

  @ApiProperty({
    description: 'Pays où se situe la propriété',
    example: 'Sénégal',
  })
  @IsOptional()
  @IsString()
  propertyOwner?: string | null;

  @ApiProperty({
    description: 'Statut de la propriété',
    example: PropertyStatus.AVAILABLE,
    enum: PropertyStatus,
  })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;
}

export class PropertyFilterDto extends PaginationDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;
}
