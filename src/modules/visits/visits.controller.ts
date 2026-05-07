import { Body, Controller, Delete, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { VisitsService } from './visits.service';
import { AssignAgentDto, CreateVisitDto, UpdateVisitStatusDto } from './visits.dto';
import { MiddlewareGuard } from '_root/guard/middleware.guard';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { API_URL } from '_root/config/api';

@ApiTags('Visits')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, MiddlewareGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  // POST v1/secure/visits/create
  // Accessible : Owner + AGENCY_ADMIN
  @Post(API_URL.VISITS.CREATE)
  @ApiOperation({ summary: 'Planifier une visite pour un lead' })
  @ApiBody({ type: CreateVisitDto })
  @ApiOkResponse({ description: 'Visite planifiée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async createVisit(
    @Body() dto: CreateVisitDto,
    @Query('agencyId') agencyId: string,
    @Query('userId') userId: string,
  ) {
    return this.visitsService.createVisit(dto, agencyId, userId);
  }

  // GET v1/secure/visits/agency-visits?agencyId=
  // Accessible : Owner + Staff
  @Get(API_URL.VISITS.AGENCY_VISITS)
  @ApiOperation({ summary: "Lister toutes les visites d'une agence" })
  @ApiOkResponse({ description: 'Liste des visites récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async getVisitsByAgency(@Query('agencyId') agencyId: string, userId: string) {
    return this.visitsService.getVisitsByAgency(agencyId, userId);
  }

  // GET v1/secure/visits/detail?visitId=
  @Get(API_URL.VISITS.DETAIL)
  @ApiOperation({ summary: "Détail d'une visite" })
  @ApiOkResponse({ description: 'Visite récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async getVisitById(@Query('visitId') visitId: string) {
    return this.visitsService.getVisitById(visitId);
  }

  // GET v1/secure/visits/my-visits
  // Accessible : CLIENT uniquement
  @Get(API_URL.VISITS.MY_VISITS)
  @ApiOperation({ summary: 'Voir mes visites planifiées (client connecté)' })
  @ApiOkResponse({ description: 'Liste de mes visites récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async getMyVisits(@Query('userId') userId: string) {
    return this.visitsService.getMyVisits(userId);
  }

  // PATCH v1/secure/visits/update-status?visitId=
  // Accessible : Owner + AGENCY_ADMIN + AGENT
  @Patch(API_URL.VISITS.UPDATE_STATUS)
  @ApiOperation({ summary: "Mettre à jour le statut d'une visite" })
  @ApiBody({ type: UpdateVisitStatusDto })
  @ApiOkResponse({ description: 'Statut mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async updateVisitStatus(@Query('visitId') visitId: string, @Body() dto: UpdateVisitStatusDto) {
    return this.visitsService.updateVisitStatus(visitId, dto);
  }

  // PATCH v1/secure/visits/assign-agent?visitId=xxx
  // Accessible : Owner + AGENCY_ADMIN
  @Patch(API_URL.VISITS.ASSIGN_AGENT)
  @ApiOperation({ summary: 'Assigner un agent à une visite' })
  @ApiBody({ type: AssignAgentDto })
  @ApiOkResponse({ description: 'Agent assigné avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async assignAgent(@Query('visitId') visitId: string, @Body() dto: AssignAgentDto) {
    return this.visitsService.assignAgent(visitId, dto);
  }

  // DELETE v1/secure/visits/delete?visitId=
  // Accessible : Owner + AGENCY_ADMIN
  @Delete(API_URL.VISITS.DELETE)
  @ApiOperation({ summary: 'Supprimer une visite' })
  @ApiOkResponse({ description: 'Visite supprimée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue' })
  async deleteVisit(@Query('visitId') visitId: string) {
    return this.visitsService.deleteVisit(visitId);
  }
}
