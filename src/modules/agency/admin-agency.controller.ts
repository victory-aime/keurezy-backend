import { Body, Controller, Get, Query, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AgencyAdminService } from './agency-admin.service';
import { UpdateAgencyStatusDto } from './dto/update-agency-status.dto';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { Role } from '../../../prisma/generated/enums';
import { AuthorizeRoles, MiddlewareGuard } from '../../guard/middleware.guard';
import { API_URL } from '../../config/api';

@ApiTags('Super Admin - Agences')
@Controller()
@ApiBearerAuth()
@UseGuards(AuthGuard, MiddlewareGuard)
@AuthorizeRoles(Role.SUPER_ADMIN)
export class AdminAgencyController {
  constructor(private readonly agencyAdminService: AgencyAdminService) {}

  // GET  — liste toutes les agences
  @Get(API_URL.AGENCY_ADMIN.LIST)
  @ApiOperation({
    summary: 'Lister toutes les agences',
    description:
      'Retourne la liste complète des agences avec leurs owners et abonnements. Réservé au SUPER_ADMIN.',
  })
  @ApiOkResponse({ description: 'Liste des agences récupérée avec succès' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async getAllAgencies() {
    return this.agencyAdminService.getAllAgencies();
  }

  // GET  — détail d'une agence par ID
  @Get(API_URL.AGENCY_ADMIN.DETAIL)
  @ApiOperation({
    summary: "Détail complet d'une agence",
    description:
      "Retourne toutes les informations d'une agence (owner, staff, abonnement) via son ID.",
  })
  @ApiQuery({ name: 'id', description: "Identifiant UUID de l'agence" })
  @ApiOkResponse({ description: "Détail de l'agence récupéré avec succès" })
  @ApiBadRequestResponse({ description: 'Agence introuvable' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async getAgencyById(@Query('id') id: string) {
    return this.agencyAdminService.getAgencyById(id);
  }

  // PATCH — changer le statut d'une agence
  @Patch(API_URL.AGENCY_ADMIN.UPDATE_STATUS)
  @ApiOperation({
    summary: 'Valider ou suspendre une agence',
    description:
      "Permet au SUPER_ADMIN de changer le statut d'une agence : PENDING → OPEN (validation) ou OPEN → CLOSE (suspension).",
  })
  @ApiQuery({ name: 'id', description: "Identifiant UUID de l'agence" })
  @ApiBody({ type: UpdateAgencyStatusDto })
  @ApiOkResponse({ description: 'Statut mis à jour avec succès' })
  @ApiBadRequestResponse({ description: 'Agence introuvable ou statut invalide' })
  @ApiUnauthorizedResponse({ description: 'Token Bearer manquant ou invalide' })
  async updateAgencyStatus(@Query('id') id: string, @Body() dto: UpdateAgencyStatusDto) {
    return this.agencyAdminService.updateAgencyStatus(id, dto.status);
  }
}
