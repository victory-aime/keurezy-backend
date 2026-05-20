import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LandPaymentType, LandStatus } from '../../../prisma/generated/enums';
import { IPaginationDto } from '_root/config/pagination.dto';

export class LandDto {
  @ApiProperty({ example: 'Terrain Almadies', description: 'Titre du terrain' })
  title: string;

  @ApiProperty({ example: 15000000, description: "Prix d'achat du terrain (en FCFA)" })
  purchasePrice: number;

  @ApiProperty({ example: 500, description: 'Superficie du terrain en m²' })
  area: number;

  @ApiProperty({ example: 'Dakar', description: 'Ville où se situe le terrain' })
  city: string;

  @ApiPropertyOptional({ example: 'Almadies', description: 'Quartier ou district du terrain' })
  district?: string;

  @ApiPropertyOptional({ example: 'Mamadou Diallo', description: 'Propriétaire du terrain' })
  landOwner?: string;

  @ApiProperty({
    enum: LandStatus,
    example: LandStatus.AVAILABLE,
    description: 'Statut du terrain',
  })
  status: LandStatus;

  @ApiProperty({
    enum: LandPaymentType,
    example: LandPaymentType.CASH,
    description: 'Type de paiement',
  })
  paymentType: LandPaymentType;

  @ApiProperty({
    example: ['https://res.cloudinary.com/example/doc.pdf'],
    description: 'URLs des documents du terrain',
    type: [String],
  })
  documents: string[];

  @ApiProperty({ example: 'uuid-de-l-agence', description: "Identifiant de l'agence" })
  agencyId: string;

  @ApiProperty({ example: 'uuid-de-l-agence', description: "Identifiant de l'agence" })
  userId: string;
}

export class CreateLandDto extends LandDto {
  @ApiProperty({ example: 'uuid-du-proprietaire', description: 'Identifiant du propriétaire' })
  ownerId: string;
}

export class UpdateLandDto extends LandDto {
  @ApiProperty({
    example: 'uuid-du-terrain',
    description: 'Identifiant du terrain à mettre à jour',
  })
  id: string;

  @ApiProperty({ example: 'uuid-du-proprietaire', description: 'Identifiant du propriétaire' })
  ownerId: string;
}

export class LandResponseDto extends LandDto {
  @ApiProperty({ example: 'uuid-du-terrain', description: 'Identifiant du terrain' })
  id: string;

  @ApiProperty({ description: 'Liste des bâtiments sur ce terrain', type: [Object] })
  batiments: any[];
}

export interface LandFilterDto extends IPaginationDto, LandDto {}