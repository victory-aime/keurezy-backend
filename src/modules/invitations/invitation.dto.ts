import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsString, ValidateNested } from 'class-validator';
import { AgencyRole } from '../../../prisma/generated/enums';

export class InvitationPermissionDto {
  @ApiProperty({ example: 'uuid-permission', description: 'Identifiant de la permission' })
  @IsString()
  permissionId: string;

  @ApiProperty({ example: true, description: 'Permission accordée ou non' })
  @IsBoolean()
  granted: boolean;
}

export class InvitationPayloadDto {
  @ApiProperty({ example: 'Amadou Diallo', description: "Nom complet de l'invité" })
  @IsString()
  name: string;

  @ApiProperty({ example: 'agent@example.com', description: "Email de l'invité" })
  @IsEmail()
  email: string;

  @ApiProperty({
    enum: AgencyRole,
    example: AgencyRole.AGENT,
    description: "Rôle attribué à l'invité dans l'agence",
  })
  @IsEnum(AgencyRole)
  role: AgencyRole;

  @ApiProperty({
    example: 'TempPass123!',
    description: "Mot de passe temporaire généré pour l'invité",
  })
  @IsString()
  temporaryPassword: string;

  @ApiProperty({
    description: "Liste des permissions accordées à l'invité",
    type: [InvitationPermissionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvitationPermissionDto)
  permissions: InvitationPermissionDto[];
}

export class CreateInvitationDto {
  @ApiProperty({ example: 'uuid-de-l-agence', description: "Identifiant de l'agence" })
  @IsString()
  agencyId: string;

  @ApiProperty({ type: InvitationPayloadDto, description: "Données de l'invité" })
  @ValidateNested()
  @Type(() => InvitationPayloadDto)
  payload: InvitationPayloadDto;
}
