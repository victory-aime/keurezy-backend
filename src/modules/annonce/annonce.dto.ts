import { AnnonceStatus, PropertyFeature, PropertyType } from '../../../prisma/generated/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty({
    example: ['https://res.cloudinary.com/example/img1.jpg'],
    description: 'URLs des images de la galerie (injectées après upload)',
    type: [String],
  })
  galleryImages: string[];

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
    example: 'ACTIVE',
    description: "Statut de l'annonce",
  })
  status?: AnnonceStatus;
}

export class UpdateAnnonceDto extends CreateAnnonceDto {
  @ApiProperty({ example: 'uuid-de-l-annonce', description: "Identifiant de l'annonce à modifier" })
  id: string;
}

export class FilterAnnonceDto {
  initialPage: number;
  limitPerPage: number;
  city?: string;
  district?: string;
  type?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  rooms?: number;
  features?: PropertyFeature[];
}
