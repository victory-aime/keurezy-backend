import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
    example: 'uuid-lead-id',
    description: 'Identifiant du lead associé à la visite',
  })
  @IsNotEmpty()
  @IsString()
  leadId: string;

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
  status: VisitStatus;
  scheduledAt: string;
  startTime: string;
  endTime: string;
  visitId: string;
  agentId?: string | null;
  title?: string;
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
