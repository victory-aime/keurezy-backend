import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { API_URL } from '../../config/api';
import { MiddlewareGuard } from '../../guard/middleware.guard';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import { AgencyService } from '../agency/agency.service';
import { PermissionsService } from './permissions.service';
import { PackService } from './pack.service';

@ApiTags('Plans')
@Controller()
export class PackController {
  constructor(
    private readonly permissionService: PermissionsService,
    private readonly packService: PackService,
    private readonly agencyService: AgencyService,
  ) {}

  @Get(API_URL.COMMON.PERMS)
  @UseGuards(AuthGuard, MiddlewareGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Récupérer toutes les permissions assignables d'une agence" })
  @ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
  @ApiOkResponse({ description: 'Liste des permissions récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllPerms(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    await this.agencyService.agencyAccessControl(agencyId, userId);
    return this.permissionService.getAssignableFeatures(agencyId);
  }

  @Get(API_URL.COMMON.PACKS)
  @AllowAnonymous()
  @ApiOperation({ summary: 'Récupérer tous les plans disponibles (public)' })
  @ApiOkResponse({ description: 'Liste des plans récupérée avec succès' })
  @ApiBadRequestResponse({ description: 'Une erreur est survenue réessayer plus tard' })
  async getAllPacks() {
    return this.packService.getAllPlans();
  }
}
