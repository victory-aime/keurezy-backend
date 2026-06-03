import { AnnonceStatus, PropertyFeature, PropertyType } from '../../../prisma/generated/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';

export class CreateAnnonceDto {
  @ApiProperty({ example: 'Appartement F3 Almadies', description: "Titre de l'annonce" })
  title: string;

  @ApiProperty({
    example: 'uuid-de-la-propriete',
    description: 'Identifiant de la propriété concernée',
  })
  propertyId: string;

  @ApiProperty({
    example: 'Bel appartement lumineux avec vue sur mer...',
    description: "Description détaillée de l'annonce",
  })
  description: string;

  @ApiPropertyOptional({
    example: ['https://res.cloudinary.com/example/img1.jpg'],
    description:
      'URLs des images injectées après upload — ne pas envoyer manuellement dans le body',
    type: [String],
    isArray: true,
  })
  galleryImages?: string[];

  @ApiPropertyOptional({
    example: 'uuid-de-l-agence',
    description: "Identifiant de l'agence publiant l'annonce",
  })
  agencyId?: string;

  @ApiPropertyOptional({
    example: 'uuid-de-l-user',
    description: "Identifiant d'un membre de l'agence publiant l'annonce",
  })
  userId?: string;

  @ApiPropertyOptional({
    enum: AnnonceStatus,
    enumName: 'AnnonceStatus',
    example: AnnonceStatus.ACTIVE,
    description: "Statut de l'annonce",
  })
  status?: AnnonceStatus;
}

export class UpdateAnnonceDto extends PartialType(CreateAnnonceDto) {
  @ApiProperty({ example: 'uuid-de-l-annonce', description: "Identifiant de l'annonce à modifier" })
  id: string;
}

export class FilterAnnonceDto {
  @ApiProperty({ example: 1, description: 'Numéro de la page initiale' })
  initialPage: number;

  @ApiProperty({ example: 10, description: "Nombre d'annonces maximum par page" })
  limitPerPage: number;

  @ApiPropertyOptional({ example: 'Dakar', description: 'Filtrer par ville' })
  city?: string;

  @ApiPropertyOptional({ example: 'Almadies', description: 'Filtrer par quartier' })
  district?: string;

  @ApiPropertyOptional({
    enum: PropertyType,
    enumName: 'PropertyType',
    description: 'Filtrer par type de propriété',
  })
  type?: PropertyType;

  @ApiPropertyOptional({
    example: 150000,
    description: 'Prix minimum (en FCFA)',
    minimum: 0,
  })
  minPrice?: number;

  @ApiPropertyOptional({
    example: 800000,
    description: 'Prix maximum (en FCFA)',
    minimum: 0,
  })
  maxPrice?: number;

  @ApiPropertyOptional({ example: 3, description: 'Nombre de chambres minimum', minimum: 0 })
  rooms?: number;

  @ApiPropertyOptional({
    enum: PropertyFeature,
    enumName: 'PropertyFeature',
    description: 'Filtrer par commodités disponibles',
    isArray: true,
  })
  features?: PropertyFeature[];
}
