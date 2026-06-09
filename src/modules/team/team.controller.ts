import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { API_URL } from '_root/config/api';
import { TeamService } from '_root/modules/team/team.service';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Team')
@ApiBearerAuth()
@Controller()
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get(API_URL.TEAM.AGENCY_TEAM_LIST)
  @ApiOperation({
    summary: "Récupérer la liste des membres de l'équipe d'une agence (Owner uniquement)",
  })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiQuery({ name: 'userId', required: true, description: "Identifiant de l'utilisateur" })
  @ApiOkResponse({ description: "Liste de l'équipe récupérée avec succès" })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllTeamsByAgency(@Query('agencyId') agencyId: string, @Query('userId') userId: string) {
    return this.teamService.getTeamListByAgencyId(agencyId, userId);
  }
  @Post(API_URL.TEAM.CHANGE_STATUS)
  @ApiOperation({ summary: "Activer ou désactiver le compte d'un membre (Owner uniquement)" })
  @ApiQuery({ name: 'id', required: true, description: "Identifiant du membre de l'équipe" })
  @ApiQuery({
    name: 'userId',
    required: true,
    description: "Identifiant de l'utilisateur effectuant l'action",
  })
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
    @Query('id') id: string,
    @Query('userId') userId: string,
    @Body() data: { status: boolean },
  ) {
    return this.teamService.enableOrDisabledAccount(id, userId, data.status);
  }
}
