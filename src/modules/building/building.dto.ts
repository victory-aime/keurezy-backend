import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { BatimentStatus } from '../../../prisma/generated/enums';
import { PaginationDto } from '../../config/pagination.dto';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Résidence Les Almadies', description: 'Nom du bâtiment' })
  @IsString()
  name: string;

  @ApiProperty({
    example: '12 Rue des Almadies, Dakar',
    description: 'Adresse complète du bâtiment',
  })
  @IsString()
  address: string;

  @ApiProperty({ example: 'Dakar', description: 'Ville où se situe le bâtiment' })
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: 'Almadies', description: 'Quartier ou district du bâtiment' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({
    example: 'Immeuble R+5 avec gardiennage 24h/24',
    description: 'Description du bâtiment',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 5, description: "Nombre d'étages du bâtiment" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floors?: number;

  @ApiProperty({ example: 'Mamadou Diallo', description: 'Nom du propriétaire du bâtiment' })
  @IsString()
  buildingOwner: string;

  @ApiProperty({
    enum: BatimentStatus,
    example: BatimentStatus.AVAILABLE,
    description: 'Statut du bâtiment',
  })
  @IsEnum(BatimentStatus)
  status: BatimentStatus;

  @ApiProperty({
    description: 'URLs des documents du bâtiment',
    example: ['https://example.com/images/property-cover.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documents?: string[];

  @ApiProperty({ example: 'uuid-de-l-agence', description: "Identifiant de l'agence" })
  @IsString()
  agencyId: string;

  @ApiPropertyOptional({
    example: 'uuid-du-terrain',
    description: 'Identifiant du terrain associé',
  })
  @IsOptional()
  @IsString()
  landId?: string | null;
}

export class UpdateBuildingDto extends CreateBuildingDto {
  @ApiProperty({
    example: 'uuid-du-batiment',
    description: 'Identifiant du bâtiment à mettre à jour',
  })
  @IsString()
  id: string;
}

export class BuildingFilterDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'Résidence', description: 'Filtrer par nom de bâtiment' })
  @IsOptional()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Dakar', description: 'Filtrer par ville' })
  @IsOptional()
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: 'Almadies', description: 'Filtrer par quartier' })
  @IsOptional()
  @IsString()
  district: string;

  @ApiPropertyOptional({ enum: BatimentStatus, description: 'Filtrer par statut' })
  @IsOptional()
  @IsEnum(BatimentStatus)
  status: BatimentStatus;
}
