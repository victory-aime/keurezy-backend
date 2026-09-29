import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VisitStatus } from '../../../prisma/generated/enums';

// DTO : CRÉER UNE VISITE
export class CreateVisitDto {
  @ApiProperty({
    example: '2024-06-15T10:00:00.000Z',
    description: 'Date et heure planifiées de la visite',
  })
  @IsNotEmpty()
  @IsDateString()
  scheduledAt: string;
  @ApiProperty({
    example: '2024-06-15T10:00:00.000Z',
    description: 'Heure de début de la visite',
  })
  @IsNotEmpty()
  @IsDateString()
  startTime: string;

  @ApiProperty({
    example: '2024-06-15T10:00:00.000Z',
    description: 'Heure de fin de la visite',
  })
  @IsNotEmpty()
  @IsDateString()
  endTime: string;

  @ApiProperty({
    example: 'uuid-property-id',
    description: 'Identifiant du bien immobilier à visiter',
  })
  @IsNotEmpty()
  @IsString()
  propertyId: string;

  @ApiProperty({
    example: 'uuid-client-id',
    description: "Client visiteur (il doit avoir réservé ou écrit à l'agence)",
  })
  @IsNotEmpty()
  @IsString()
  clientId: string;

  @ApiPropertyOptional({
    example: 'uuid-agent-id',
    description: "Identifiant de l'agent assigné à la visite",
  })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({
    example: 'Visite de la maison',
    description: 'Titre du rendez-vous',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'Apporter les clés du local B',
    description: 'Notes supplémentaires pour la visite',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    enum: VisitStatus,
    example: VisitStatus.CONFIRMED,
    description: 'Nouveau statut de la visite',
  })
  @IsNotEmpty()
  @IsEnum(VisitStatus)
  status: VisitStatus;
}

// DTO : METTRE À JOUR LE STATUT D'UNE VISITE
export class UpdateVisitDto {
  @ApiProperty({
    enum: VisitStatus,
    example: VisitStatus.CONFIRMED,
    description: 'Nouveau statut de la visite',
  })
  @IsNotEmpty()
  @IsEnum(VisitStatus)
  status: VisitStatus;

  @ApiProperty({ example: '2026-10-01', description: 'Date de la visite' })
  @IsNotEmpty()
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z', description: 'Heure de début' })
  @IsNotEmpty()
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-10-01T11:00:00.000Z', description: 'Heure de fin' })
  @IsNotEmpty()
  @IsDateString()
  endTime: string;

  @ApiProperty({ example: 'uuid-visite', description: 'Identifiant de la visite à modifier' })
  @IsNotEmpty()
  @IsString()
  visitId: string;

  @ApiPropertyOptional({ example: 'uuid-agent', description: 'Agent assigné' })
  @IsOptional()
  @IsString()
  agentId?: string | null;

  @ApiPropertyOptional({ example: 'Visite appartement F3', description: 'Titre de la visite' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Apporter les clés', description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// DTO : RÉASSIGNER UN AGENT À UNE VISITE
export class AssignAgentDto {
  @ApiProperty({
    example: 'uuid-agent-id',
    description: 'Identifiant du nouvel agent à assigner à la visite',
  })
  @IsNotEmpty()
  @IsString()
  agentId: string;
}

// DTO : VISITES D'UNE AGENCE, FILTRABLES PAR PÉRIODE (agenda)
export class AgencyVisitsQueryDto {
  @ApiProperty({ description: "Identifiant de l'agence" })
  @IsNotEmpty()
  @IsString()
  agencyId: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Début de période (inclus)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Fin de période (incluse)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
