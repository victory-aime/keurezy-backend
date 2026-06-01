import { ApiProperty } from '@nestjs/swagger';
import { AgencyRole } from '../../../prisma/generated/enums';

export class InvitationPayloadDto {
  @ApiProperty({ example: 'Amadou Diallo', description: "Nom complet de l'invité" })
  name: string;

  @ApiProperty({ example: 'agent@example.com', description: "Email de l'invité" })
  email: string;

  @ApiProperty({
    enum: AgencyRole,
    example: AgencyRole.AGENT,
    description: "Rôle attribué à l'invité dans l'agence",
  })
  role: AgencyRole;

  @ApiProperty({
    example: 'TempPass123!',
    description: "Mot de passe temporaire généré pour l'invité",
  })
  temporaryPassword: string;

  @ApiProperty({
    description: "Liste des permissions accordées à l'invité",
    example: [{ permissionId: 'uuid-permission', granted: true }],
    type: 'array',
    items: {
      type: 'object',
      properties: {
        permissionId: { type: 'string', example: 'uuid-permission' },
        granted: { type: 'boolean', example: true },
      },
    },
  })
  permissions: { permissionId: string; granted: boolean }[];
}

export class CreateInvitationDto {
  @ApiProperty({
    example: 'uuid-de-l-admin',
    description: "Identifiant de l'administrateur qui envoie l'invitation",
  })
  adminId: string;

  @ApiProperty({ example: 'uuid-user', description: "Identifiant de l'utilisateur connecté" })
  userId: string; // id de l'utilisateur

  @ApiProperty({ example: 'uuid-de-l-agence', description: "Identifiant de l'agence" })
  agencyId: string;

  @ApiProperty({ type: InvitationPayloadDto, description: "Données de l'invité" })
  payload: {
    name: string;
    email: string;
    role: AgencyRole;
    temporaryPassword: string;
    permissions: { permissionId: string; granted: boolean }[];
  };
}
