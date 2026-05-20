import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BatimentStatus } from '../../../prisma/generated/enums';
import { IPaginationDto } from '_root/config/pagination.dto';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Résidence Les Almadies', description: 'Nom du bâtiment' })
  name: string;

  @ApiProperty({ example: 'uuid-user', description: "Identifiant de l'utilisateur" })
  userId: string; // id

  @ApiProperty({
    example: '12 Rue des Almadies, Dakar',
    description: 'Adresse complète du bâtiment',
  })
  address: string;

  @ApiProperty({ example: 'Dakar', description: 'Ville où se situe le bâtiment' })
  city: string;

  @ApiPropertyOptional({ example: 'Almadies', description: 'Quartier ou district du bâtiment' })
  district?: string;

  @ApiPropertyOptional({
    example: 'Immeuble R+5 avec gardiennage 24h/24',
    description: 'Description du bâtiment',
  })
  description?: string;

  @ApiPropertyOptional({ example: 5, description: "Nombre d'étages du bâtiment" })
  floors?: number;

  @ApiProperty({ example: 'Mamadou Diallo', description: 'Nom du propriétaire du bâtiment' })
  buildingOwner: string;

  @ApiProperty({
    enum: BatimentStatus,
    example: BatimentStatus.AVAILABLE,
    description: 'Statut du bâtiment',
  })
  status: BatimentStatus;

  @ApiProperty({
    description: 'URLs des documents du bâtiment',
    example: ['https://example.com/images/property-cover.jpg'],
    type: [String],
  })
  documents: string[];

  @ApiProperty({ example: 'uuid-de-l-agence', description: "Identifiant de l'agence" })
  agencyId: string;

  @ApiPropertyOptional({
    example: 'uuid-du-terrain',
    description: 'Identifiant du terrain associé',
  })
  landId?: string;
}

export class UpdateBuildingDto extends CreateBuildingDto {
  @ApiProperty({
    example: 'uuid-du-batiment',
    description: 'Identifiant du bâtiment à mettre à jour',
  })
  id: string;
}

export class BuildingFilterDto extends IPaginationDto {
  @ApiPropertyOptional({ example: 'Résidence', description: 'Filtrer par nom de bâtiment' })
  name: string;

  @ApiPropertyOptional({ example: 'Dakar', description: 'Filtrer par ville' })
  city: string;

  @ApiPropertyOptional({ example: 'Almadies', description: 'Filtrer par quartier' })
  district: string;

  @ApiPropertyOptional({ enum: BatimentStatus, description: 'Filtrer par statut' })
  status: BatimentStatus;
}