import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
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

/** Jeton reçu par e-mail (lien d'invitation). */
export class InvitationTokenDto {
  @ApiProperty({ example: 'uuid-du-jeton', description: "Jeton d'invitation reçu par e-mail" })
  @IsString()
  token: string;
}

/** Acceptation : code reçu par e-mail et mot de passe choisi par l'invité. */
export class AcceptInvitationDto extends InvitationTokenDto {
  @ApiProperty({ example: '482913', description: 'Code à 6 chiffres reçu par e-mail' })
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres' })
  code: string;

  @ApiProperty({
    example: 'MotDePasse2026',
    description: 'Mot de passe choisi (12 caractères, une majuscule, une minuscule, un chiffre)',
  })
  @IsString()
  @MinLength(12, { message: 'Le mot de passe doit contenir au moins 12 caractères' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/, {
    message: 'Le mot de passe doit contenir une majuscule, une minuscule et un chiffre',
  })
  password: string;
}
