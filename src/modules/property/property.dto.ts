import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { PropertyStatus, PropertyType, PropertyFeature } from '../../../prisma/generated/enums';
import { IPaginationDto } from '../../config/pagination.dto';

export class propertyDto {
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

  @IsString()
  userId: string;

  @IsOptional()
  batimentId?: string;

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
  documents: string[];

  @ApiProperty({
    description: 'Type de la propriété',
    example: 'APARTMENT',
    enum: PropertyType,
  })
  type: PropertyType;

  @ApiProperty({
    description: 'Caractéristique de la propriété',
    example: 'KITCHEN',
    enum: PropertyFeature,
  })
  features: PropertyFeature[];

  @ApiProperty({
    description: 'Nombre de salle de bain',
    example: 4,
  })
  bathrooms: number;

  @ApiProperty({
    description: 'Nombre de salle de bain',
    example: 4,
  })
  price: number;
  @ApiProperty({
    description: 'Nombre de salle de bain',
    example: 4,
  })
  caution: number;

  @ApiProperty({
    description: 'Surface de la propriété en mètres carrés',
    example: 120,
  })
  area: number;

  @ApiProperty({
    description: 'Nombre de chambres de la propriété',
    example: 3,
  })
  rooms: number;

  @ApiProperty({
    description: 'Nombre de chambres de la propriété',
    example: 'A3',
  })
  propertyNumber: string;

  @ApiProperty({
    description: 'Ville où se situe la propriété',
    example: 'Dakar',
  })
  city?: string | null;

  @ApiProperty({
    description: 'Adresse complète où se situe la propriété',
    example: 'Dakar',
  })
  address: string | null;

  @ApiProperty({
    description: 'Pays où se situe la propriété',
    example: 'Sénégal',
  })
  district?: string | null;

  @ApiProperty({
    description: 'Pays où se situe la propriété',
    example: 'Sénégal',
  })
  propertyOwner?: string | null;
}

export class PropertyFilterDto extends IPaginationDto {
  title?: string;
  status?: PropertyStatus;
  type?: PropertyType;
}
