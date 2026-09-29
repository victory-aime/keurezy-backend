import { Body, Controller, Delete, Get, Patch, Post, Query } from '@nestjs/common';
import { API_URL } from '../../config/api';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import { TeamService } from './team.service';
import { UpdateStaffPermissionsDto } from './team.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../../guard/permission.guard';

@ApiTags('Team')
@ApiBearerAuth()
@Controller()
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get(API_URL.TEAM.AGENCY_TEAM_LIST)
  @RequirePermission('view_users')
  @ApiOperation({
    summary: "Récupérer la liste des membres de l'équipe d'une agence (Owner uniquement)",
  })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: "Liste de l'équipe récupérée avec succès" })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllTeamsByAgency(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.teamService.getTeamListByAgencyId(agencyId, userId);
  }
  @Post(API_URL.TEAM.CHANGE_STATUS)
  @ApiOperation({ summary: "Activer ou désactiver le compte d'un membre (Owner uniquement)" })
  @ApiQuery({ name: 'id', required: true, description: "Identifiant du membre de l'équipe" })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'boolean',
          example: true,
          description: 'true pour activer, false pour désactiver',
        },
      },
      required: ['status'],
    },
  })
  @ApiOkResponse({ description: 'Statut du compte mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async enabledOrDisabled(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() ownerId: string,
    @Body() data: { status: boolean; id: string },
  ) {
    return this.teamService.enableOrDisabledAccount(data, agencyId, ownerId);
  }

  @Patch(API_URL.TEAM.UPDATE_PERMISSIONS)
  @ApiOperation({
    summary: "Mettre à jour les permissions d'un membre (Owner uniquement)",
    description:
      'La liste envoyée remplace les permissions du membre. Seules les permissions du plan actif sont acceptées.',
  })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiBody({ type: UpdateStaffPermissionsDto })
  @ApiOkResponse({ description: 'Permissions mises à jour ; retourne le membre' })
  @ApiBadRequestResponse({ description: 'PERMISSIONS_NOT_ASSIGNABLE : hors du plan' })
  @ApiForbiddenResponse({ description: "OWNER_ONLY : réservé au propriétaire de l'agence" })
  @ApiNotFoundResponse({ description: "STAFF_NOT_FOUND : membre d'une autre agence ou inexistant" })
  async updatePermissions(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() profileId: string,
    @Body() dto: UpdateStaffPermissionsDto,
  ) {
    return this.teamService.updateMemberPermissions(dto, agencyId, profileId);
  }

  @Delete(API_URL.TEAM.REMOVE_MEMBER)
  @ApiOperation({ summary: "Retirer un membre de l'équipe (owner uniquement)" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du membre (Staff)' })
  @ApiOkResponse({ description: 'Membre retiré, compte désactivé' })
  async removeMember(
    @Query('id') id: string,
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() ownerId: string,
  ) {
    return this.teamService.removeMember(id, agencyId, ownerId);
  }

  @Get(API_URL.TEAM.MEMBER_IMPACT)
  @ApiOperation({ summary: "Ce que le retrait d'un membre entraîne (owner uniquement)" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiQuery({ name: 'id', required: true, description: 'Identifiant du membre (Staff)' })
  async getMemberImpact(
    @Query('id') id: string,
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() ownerId: string,
  ) {
    return this.teamService.getMemberImpact(id, agencyId, ownerId);
  }
}
