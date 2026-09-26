import {
  AnnonceStatus,
  PropertyFeature,
  PropertyType,
  RentalType,
} from '../../../prisma/generated/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { CALENDAR_DATE } from '../rentals/calendar-date';

export class CreateAnnonceDto {
  @ApiProperty({ example: 'Appartement F3 Almadies', description: "Titre de l'annonce" })
  @IsString()
  title: string;

  @ApiProperty({
    example: 'uuid-de-la-propriete',
    description: 'Identifiant de la propriété concernée',
  })
  @IsString()
  propertyId: string;

  @ApiProperty({
    example: 'Bel appartement lumineux avec vue sur mer...',
    description: "Description détaillée de l'annonce",
  })
  @IsString()
  description: string;

  @ApiPropertyOptional({
    example: ['https://res.cloudinary.com/example/img1.jpg'],
    description:
      'URLs des images injectées après upload — ne pas envoyer manuellement dans le body',
    type: [String],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  galleryImages?: string[];

  @ApiProperty({
    example: 'uuid-de-l-agence',
    description: "Identifiant de l'agence publiant l'annonce",
  })
  @IsString()
  agencyId: string;

  @ApiPropertyOptional({
    enum: AnnonceStatus,
    enumName: 'AnnonceStatus',
    example: AnnonceStatus.ACTIVE,
    description: "Statut de l'annonce",
  })
  @IsOptional()
  @IsEnum(AnnonceStatus)
  status?: AnnonceStatus;
}

export class UpdateAnnonceDto extends PartialType(CreateAnnonceDto) {
  @ApiProperty({ example: 'uuid-de-l-annonce', description: "Identifiant de l'annonce à modifier" })
  @IsString()
  id: string;
}

export class FilterAnnonceDto {
  @ApiProperty({ example: 1, description: 'Numéro de la page initiale' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  initialPage: number;

  @ApiProperty({ example: 10, description: "Nombre d'annonces maximum par page" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limitPerPage: number;

  @ApiPropertyOptional({ example: 'Dakar', description: 'Filtrer par ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Almadies', description: 'Filtrer par quartier' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({
    enum: PropertyType,
    enumName: 'PropertyType',
    description: 'Filtrer par type de propriété',
  })
  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;

  @ApiPropertyOptional({
    enum: RentalType,
    enumName: 'RentalType',
    description:
      'Filtrer par type de location ; minPrice/maxPrice portent alors sur le prix de cette modalité',
  })
  @IsOptional()
  @IsEnum(RentalType)
  rentalType?: RentalType;

  @ApiPropertyOptional({
    example: 150000,
    description: 'Prix minimum (en FCFA)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    example: 800000,
    description: 'Prix maximum (en FCFA)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 3, description: 'Nombre de chambres minimum', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rooms?: number;

  @ApiPropertyOptional({
    enum: PropertyFeature,
    enumName: 'PropertyFeature',
    description: 'Filtrer par commodités disponibles',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(PropertyFeature, { each: true })
  features?: PropertyFeature[];
}

export class FindAnnonceDto {
  @ApiProperty({ example: 'uuid-de-l-annonce', description: "Identifiant de l'annonce" })
  @IsUUID()
  id: string;
}

export class AnnonceAvailabilityDto extends FindAnnonceDto {
  @ApiProperty({ enum: RentalType, enumName: 'RentalType', example: RentalType.NIGHTLY })
  @IsEnum(RentalType)
  rentalType: RentalType;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Début de la recherche (défaut : aujourd’hui)',
  })
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'from doit être au format AAAA-MM-JJ' })
  from?: string;

  @ApiPropertyOptional({
    example: '2027-03-31',
    description: 'Fin de la recherche, incluse (défaut : horizon du type)',
  })
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'to doit être au format AAAA-MM-JJ' })
  to?: string;
}

export class AnnonceQuoteDto {
  @ApiProperty({ example: 'uuid-de-l-annonce', description: "Identifiant de l'annonce" })
  @IsUUID()
  annonceId: string;

  @ApiProperty({ enum: RentalType, enumName: 'RentalType', example: RentalType.NIGHTLY })
  @IsEnum(RentalType)
  rentalType: RentalType;

  @ApiProperty({ example: '2026-10-05', description: 'Premier jour de la location' })
  @Matches(CALENDAR_DATE, { message: 'startDate doit être au format AAAA-MM-JJ' })
  startDate: string;

  @ApiProperty({
    example: 3,
    description: 'Nombre d’unités : jours, nuits, mois ou années selon le type',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration: number;
}
